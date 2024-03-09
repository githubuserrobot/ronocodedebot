import useVuelidate from '@vuelidate/core'
import { helpers, minLength, required } from '@vuelidate/validators'
import type { Ref } from 'vue'
import type {
  BoolType,
  ColumnType,
  FormColumnType,
  FormType,
  LinkToAnotherRecordType,
  SelectOptionsType,
  StringOrNullType,
  TableType,
} from 'nocodb-sdk'
import { ErrorMessages, RelationTypes, UITypes, isLinksOrLTAR, isSystemColumn, isVirtualCol } from 'nocodb-sdk'
import { isString } from '@vue/shared'
import { filterNullOrUndefinedObjectProperties } from '~/helpers/parsers/parserHelpers'
import {
  PreFilledMode,
  SharedViewPasswordInj,
  computed,
  createEventHook,
  extractSdkResponseErrorMsg,
  isNumericFieldType,
  message,
  parseProp,
  provide,
  ref,
  storeToRefs,
  useApi,
  useBase,
  useI18n,
  useInjectionState,
  useMetas,
  useProvideSmartsheetRowStore,
  useViewsStore,
  watch,
} from '#imports'
import type { SharedViewMeta } from '#imports'

const [useProvideSharedFormStore, useSharedFormStore] = useInjectionState((sharedViewId: string) => {
  const progress = ref(false)
  const notFound = ref(false)
  const submitted = ref(false)
  const passwordDlg = ref(false)
  const password = ref<string | null>(null)
  const passwordError = ref<string | null>(null)
  const secondsRemain = ref(0)

  const { sharedView } = storeToRefs(useViewsStore())

  provide(SharedViewPasswordInj, password)

  const sharedFormView = ref<FormType>()
  const meta = ref<TableType>()
  const columns = ref<
    (ColumnType & {
      required?: BoolType
      show?: BoolType
      label?: StringOrNullType
      enable_scanner?: BoolType
      read_only?: boolean
    })[]
  >()
  const sharedViewMeta = ref<SharedViewMeta>({})
  const formResetHook = createEventHook<void>()

  const { api, isLoading } = useApi()

  const { metas, setMeta } = useMetas()

  const baseStore = useBase()
  const { base, sqlUis } = storeToRefs(baseStore)

  const basesStore = useBases()

  const { basesUser } = storeToRefs(basesStore)

  const { t } = useI18n()

  const route = useRoute()

  const formState = ref<Record<string, any>>({})

  const { state: additionalState } = useProvideSmartsheetRowStore(
    meta as Ref<TableType>,
    ref({
      row: formState,
      rowMeta: { new: true },
      oldRow: {},
    }),
  )

  const fieldRequired = (fieldName = 'This field') =>
    helpers.withMessage(t('msg.error.fieldRequired', { value: fieldName }), required)

  const formColumns = computed(() =>
    columns.value?.filter((c) => c.show).filter((col) => !isVirtualCol(col) || isLinksOrLTAR(col.uidt)),
  )

  const loadSharedView = async () => {
    passwordError.value = null

    try {
      const viewMeta = await api.public.sharedViewMetaGet(sharedViewId, {
        headers: {
          'xc-password': password.value,
        },
      })

      passwordDlg.value = false

      sharedView.value = viewMeta
      sharedFormView.value = viewMeta.view
      meta.value = viewMeta.model

      const fieldById = (viewMeta.columns || []).reduce(
        (o: Record<string, any>, f: Record<string, any>) => ({
          ...o,
          [f.fk_column_id]: f,
        }),
        {} as Record<string, FormColumnType>,
      )

      columns.value = viewMeta.model?.columns?.map((c) => ({
        ...c,
        meta: { ...parseProp(fieldById[c.id].meta), ...parseProp(c.meta) },
        description: fieldById[c.id].description,
      }))

      const _sharedViewMeta = (viewMeta as any).meta
      sharedViewMeta.value = isString(_sharedViewMeta) ? JSON.parse(_sharedViewMeta) : _sharedViewMeta

      await setMeta(viewMeta.model)

      // if base is not defined then set it with an object containing source
      if (!base.value?.sources)
        baseStore.setProject({
          sources: [
            {
              id: viewMeta.source_id,
              type: viewMeta.client,
            },
          ],
        })

      const relatedMetas = { ...viewMeta.relatedMetas }

      Object.keys(relatedMetas).forEach((key) => setMeta(relatedMetas[key]))

      if (viewMeta.users) {
        basesUser.value.set(viewMeta.base_id, viewMeta.users)
      }

      handlePreFillForm()
    } catch (e: any) {
      if (e.response && e.response.status === 404) {
        notFound.value = true
      } else if ((await extractSdkResponseErrorMsg(e)) === ErrorMessages.INVALID_SHARED_VIEW_PASSWORD) {
        passwordDlg.value = true

        if (password.value && password.value !== '') passwordError.value = 'Something went wrong. Please check your credentials.'
      }
    }
  }

  const validators = computed(() => {
    const obj: Record<string, Record<string, any>> = {
      localState: {},
      virtual: {},
    }

    if (!formColumns.value) return obj

    for (const column of formColumns.value) {
      if (
        !isVirtualCol(column) &&
        ((column.rqd && !column.cdf) || (column.pk && !(column.ai || column.cdf)) || column.required)
      ) {
        obj.localState[column.title!] = { required: fieldRequired() }
      } else if (
        isLinksOrLTAR(column) &&
        column.colOptions &&
        (column.colOptions as LinkToAnotherRecordType).type === RelationTypes.BELONGS_TO
      ) {
        const col = columns.value?.find((c) => c.id === (column?.colOptions as LinkToAnotherRecordType)?.fk_child_column_id)

        if ((col && col.rqd && !col.cdf) || column.required) {
          if (col) {
            obj.virtual[column.title!] = { required: fieldRequired() }
          }
        }
      } else if (isVirtualCol(column) && column.required) {
        obj.virtual[column.title!] = {
          minLength: minLength(1),
          required: fieldRequired(),
        }
      }
    }

    return obj
  })

  const v$ = useVuelidate(
    validators,
    computed(() => ({ localState: formState.value, virtual: additionalState.value })),
  )

  const submitForm = async () => {
    try {
      if (!(await v$.value?.$validate())) {
        message.error(t('msg.error.someOfTheRequiredFieldsAreEmpty'))
        return
      }

      progress.value = true
      const data: Record<string, any> = { ...formState.value, ...additionalState.value }
      const attachment: Record<string, any> = {}

      /** find attachments in form data */
      for (const col of metas.value?.[sharedView.value?.fk_model_id as string]?.columns) {
        if (col.uidt === UITypes.Attachment) {
          if (data[col.title]) {
            attachment[`_${col.title}`] = data[col.title].map((item: { file: File }) => item.file)
          }
        }
      }

      const filtedData = filterNullOrUndefinedObjectProperties({
        data,
        ...attachment,
      })

      await api.public.dataCreate(sharedView.value!.uuid!, filtedData, {
        headers: {
          'xc-password': password.value,
        },
      })

      submitted.value = true
      progress.value = false
    } catch (e: any) {
      console.log(e)
      await message.error(await extractSdkResponseErrorMsg(e))
    }
    progress.value = false
  }

  const clearForm = async () => {
    formResetHook.trigger()

    additionalState.value = {}
    formState.value = {}
    v$.value?.$reset()
  }

  function handlePreFillForm() {
    // http://localhost:3000/#/nc/form/070dbc84-f3ca-43a3-808a-3547a873933f?Multiselect=a,b
    if (Object.keys(route.query).length && sharedViewMeta.value.preFilledMode !== PreFilledMode.Disabled) {
      console.log('router', route.query)
      columns.value = columns.value?.map((c) => {
        if (!c.title || !route.query?.[c.title] || isSystemColumn(c) || (isVirtualCol(c) && !isLinksOrLTAR(c)) || isAttachment(c))
          return c

        switch (sharedViewMeta.value.preFilledMode) {
          case PreFilledMode.Hidden: {
            c.show = false
            break
          }
          case PreFilledMode.Locked: {
            c.read_only = true
            break
          }
        }

        switch (c.uidt) {
          case UITypes.SingleSelect:
          case UITypes.MultiSelect:
          case UITypes.User: {
            const limitOptions = (parseProp(c.meta).limitOptions || []).reduce((ac, op) => {
              if (op?.id) {
                ac[op.id] = op
              }
              return ac
            }, {})

            const queryOptions = (route.query?.[c.title] as string)?.split(',')

            let options: string[] = []

            if ([UITypes.SingleSelect, UITypes.MultiSelect].includes(c.uidt as UITypes)) {
              options = ((c.colOptions as SelectOptionsType)?.options || [])
                .filter((op) => {
                  if (
                    op?.id &&
                    op?.title &&
                    queryOptions.includes(op.title) &&
                    (limitOptions[op.id] ? limitOptions[op.id]?.show : !(parseProp(c.meta).limitOptions || []).length)
                  ) {
                    return true
                  }
                  return false
                })
                .map((op) => op.title as string)

              if (options.length) {
                formState.value[c.title] = c.uidt === UITypes.SingleSelect ? options[0] : options.join(',')
              }
            } else {
              options = (meta.value?.base_id ? basesUser.value.get(meta.value.base_id) || [] : [])
                .filter((user) => {
                  if (
                    user?.id &&
                    user?.email &&
                    queryOptions.includes(user.email) &&
                    (limitOptions[user.id] ? limitOptions[user.id]?.show : !(parseProp(c.meta).limitOptions || []).length)
                  ) {
                    return true
                  }
                  return false
                })
                .map((user) => user.email)

              if (options.length) {
                formState.value[c.title] = !parseProp(c.meta)?.is_multi ? options[0] : options.join(',')
              }
            }
            break
          }
          default: {
            if (isNumericFieldType(c, getColAbstractType(c))) {
              if (!isNaN(parseInt(route.query?.[c.title] as string))) {
                formState.value[c.title] = parseInt(route.query?.[c.title] as string)
              }
            } else {
              formState.value[c.title] = route.query?.[c.title]
            }
          }
        }
        console.log('c', c)

        console.log('form state', formState.value)

        return c
      })

      console.log('column', columns.value)
    }
  }

  function getColAbstractType(c: ColumnType) {
    return (c?.source_id ? sqlUis.value[c?.source_id] : Object.values(sqlUis.value)[0]).getAbstractType(c)
  }

  /** reset form if show_blank_form is true */
  watch(submitted, (nextVal) => {
    if (nextVal && sharedFormView.value?.show_blank_form) {
      secondsRemain.value = 5
      const intvl = setInterval(() => {
        secondsRemain.value = secondsRemain.value - 1

        if (secondsRemain.value < 0) {
          submitted.value = false

          formResetHook.trigger()

          clearInterval(intvl)
        }
      }, 1000)
    }

    /** reset form state and validation */
    if (!nextVal) {
      additionalState.value = {}
      formState.value = {}
      v$.value?.$reset()
    }
  })

  watch(password, (next, prev) => {
    if (next !== prev && passwordError.value) passwordError.value = null
  })

  return {
    sharedView,
    sharedFormView,
    loadSharedView,
    columns,
    submitForm,
    clearForm,
    progress,
    meta,
    validators,
    v$,
    formColumns,
    formState,
    notFound,
    password,
    passwordError,
    submitted,
    secondsRemain,
    passwordDlg,
    isLoading,
    sharedViewMeta,
    onReset: formResetHook.on,
  }
}, 'expanded-form-store')

export { useProvideSharedFormStore }

export function useSharedFormStoreOrThrow() {
  const sharedFormStore = useSharedFormStore()

  if (sharedFormStore == null) throw new Error('Please call `useProvideSharedFormStore` on the appropriate parent component')

  return sharedFormStore
}
