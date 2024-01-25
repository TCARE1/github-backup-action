import {getOrgRepoNames} from '../src/main'

describe('getRepoNames', () => {
    const env = process.env

    beforeEach(() => {
        jest.resetModules()
        process.env = {}
    })

    afterEach(() => {
        process.env = env // Restore original process.env after each test
    })

    it('should fetch repository names for the given organization', async () => {
        process.env = {
            CI: 'true',
            GH_ORG: 'myorg',
            GH_API_KEY: 'apikey',
            AZURE_CONTAINER_NAME: 'someContainerName',
            AZURE_CONNECTION_STRING: 'azure-connection-string'
        }

        const organization = 'testOrg'

        const repoNames = await getOrgRepoNames(organization)

        expect(repoNames).toEqual(['testorg/publicrepo', 'testorg/publicrepo2'])
    })

    it('should handle errors when fetching repository names', async () => {
        process.env = {
            CI: 'true',
            GH_ORG: 'myorg',
            GH_API_KEY: 'apikey',
            AZURE_CONTAINER_NAME: 'someContainerName',
            AZURE_CONNECTION_STRING: 'azure-connection-string'
        }

        const organization = 'testOrgthatdoesnotexist'

        await expect(getOrgRepoNames(organization)).rejects.toThrowError(
            'Not Found'
        )
    })

})
