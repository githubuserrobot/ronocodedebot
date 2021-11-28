import { loginPage } from "../../support/page_objects/navigation"
import { roles } from "../../support/page_objects/projectConstants"
import { isTestSuiteActive } from "../../support/page_objects/projectConstants"

export const genTest = (type, xcdb) => {

  describe(`${type.toUpperCase()} Project operations`, () => {
    if(!isTestSuiteActive(type, xcdb)) return;

    before(() => {
      loginPage.signIn(roles.owner.credentials)
    })

    it('Stop Project', () => {
      //cy.visit('./#/projects')
      cy.get(`.nc-${type}-project-row .mdi-stop-circle-outline`, { timeout: 10000 })
        .should('exist')
        .last()
        .invoke('show')
        .click();
      cy.contains('Submit')
        .closest('button')
        .click();

      cy.toastWait('stopped successfully')
    })

    it('Start Project', () => {
      //cy.visit('./#/projects')
      cy.get(`.nc-${type}-project-row .mdi-play-circle-outline`, { timeout: 10000 })
        .should('exist')
        .last()
        .invoke('show')
        .click();
      cy.contains('Submit').closest('button').click();

      cy.toastWait('started successfully')
    })

    it('Restart Project', () => {
      //cy.visit('./#/projects')
      cy.get(`.nc-${type}-project-row .mdi-restart`, { timeout: 10000 })
        .should('exist')
        .last()
        .invoke('show')
        .click();
      cy.contains('Submit')
        .closest('button')
        .click();
      
      cy.toastWait('restarted successfully')
    })

    it('Delete Project', () => {
      //cy.visit('./#/projects')
      cy.get(`.nc-${type}-project-row .mdi-delete-circle-outline`, { timeout: 10000 })
        .should('exist')
        .last()
        .invoke('show')
        .click();
      cy.contains('Submit')
        .closest('button')
        .click();
      
      cy.toastWait('deleted successfully')
    })
  })
}

/**
 * @copyright Copyright (c) 2021, Xgene Cloud Ltd
 *
 * @author Pranav C Balan <pranavxc@gmail.com>
 *
 * @license GNU AGPL version 3 or any later version
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 *
 */