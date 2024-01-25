/* eslint-disable no-inner-declarations */
import {checkEnv} from '../src/check'
import {sleep} from '../src/sleep'
import {Octokit} from '@octokit/core'
import {BlobServiceClient} from '@azure/storage-blob'
import axios from 'axios'
import 'dotenv/config'
import {
    createWriteStream,
    writeFileSync,
    readFileSync,
    createReadStream
} from 'fs'
import {getInput} from '@actions/core'

// All the GitHub variables
const githubOrganization: string = process.env.GITHUB_ACTIONS
    ? getInput('github-organization', {required: true})
    : (process.env.GH_ORG as string)
const octokit = new Octokit({
    auth: process.env.GITHUB_ACTIONS
        ? getInput('github-apikey')
        : (process.env.GH_API_KEY as string)
})

// All the Azure variables
const containerName: string = process.env.GITHUB_ACTIONS
    ? getInput('azure-container-name', {required: true})
    : (process.env.AZURE_CONTAINER_NAME as string)
const connectionString: string = process.env.GITHUB_ACTIONS
    ? getInput('azure-connection-string', {required: true})
    : (process.env.AZURE_CONNECTION_STRING as string)

const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString)

// All the script variables
const transferMigration =
    getInput('transfer-migration', {required: false}) ||
    process.env.TRANSFER_MIGRATION === 'true'
const purgeMigration =
    getInput('purge-migration', {required: false}) ||
    process.env.PURGE_MIGRATION === 'true'

export async function getOrgRepoNames(organization: string): Promise<string[]> {
    try {
        console.log(`\nGet list of repositories for ${organization} org...\n`)

        let repoNames: string[] = []
        let fetchMore = true
        let page = 1
        const n_results = 10

        // Fetch all repositories that currently exist within the org
        while (fetchMore) {
            const repos = await octokit.request('GET /orgs/{org}/repos', {
                org: organization,
                type: 'all',
                per_page: n_results,
                sort: 'full_name',
                page: page++
            })
            repoNames = repoNames.concat(repos.data.map(item => item.full_name))
            fetchMore = repos.data.length >= n_results
        }
        return repoNames
    } catch (error) {
        console.error(
            `Error occurred while retrieving list of repositories for ${organization} org:`,
            error
        )
        throw error
    }
}

// Function for running the migration
async function runGitHubMigration(organization: string): Promise<void> {
    try {
        // Fetch repo names asynchronously
        const repoNames = await getOrgRepoNames(organization)

        console.log(repoNames)

        console.log(
            `\nStarting backup for ${repoNames.length} repositories in ${organization}}...\n`
        )
        // Start the migration on GitHub
        const migration = await octokit.request('POST /orgs/{org}/migrations', {
            org: organization,
            repositories: repoNames,
            lock_repositories: false
        })

        // Write the response to a file
        writeFileSync('migration_response.json', JSON.stringify(migration.data))

        console.log(
            `Migration started successfully!\n\nThe current migration id is ${migration.data.id} and the state is currently on ${migration.data.state}\n`
        )
    } catch (error) {
        console.error('Error occurred during the migration:', error)
    }
}

// Function for downloading the migration
async function runBackupToStorage(organization: string): Promise<void> {
    // Function for retrieving data from the stored file that the runMigration function created
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async function retrieveMigrationDataFromGitHub() {
        try {
            // Read the contents of the file
            const fileContents = readFileSync(
                'migration_response.json',
                'utf-8'
            )

            // Parse the JSON contents back into a JavaScript object
            const migrationData = JSON.parse(fileContents)

            // Now you can access the data from the migration response
            console.log('Successfully loaded migration data!\n')

            return migrationData // Return the parsed data to be used later
        } catch (error) {
            console.error('Error occurred while reading the file:', error)
            throw error
        }
    }

    // Function for uploading archive to Azure Storage
    async function uploadArchiveToAzure(filename: string): Promise<unknown> {
        try {
            console.log(
                `Uploading archive to Azure Storage (${containerName})...\n`
            )
            const fileStream = createReadStream(filename)

            // Get a block blob client
            const containerClient =
                blobServiceClient.getContainerClient(containerName)
            const blockBlobClient = containerClient.getBlockBlobClient(filename)

            // Upload data to the blob
            const uploadBlobResponse = await blockBlobClient.uploadStream(
                fileStream
            )
            console.log(
                `Uploaded block blob ${filename} successfully`,
                uploadBlobResponse.requestId
            )

            return uploadBlobResponse
        } catch (error) {
            console.error('Error occurred while uploading the file:', error)
        }
    }

    // Function for deleting archive from Github
    async function deleteArchiveFromGitHub(
        organization: string,
        migrationId: number
    ): Promise<void> {
        try {
            console.log(
                'Deleting organization migration archive from GitHub...\n'
            )
            await octokit.request(
                'DELETE /orgs/{org}/migrations/{migration_id}/archive',
                {
                    org: organization,
                    migration_id: migrationId
                }
            )
        } catch (error) {
            console.error('Error occurred while deleting the archive:', error)
        }
    }

    // Function for transferring migration archive from Github to Azure Storage
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async function transferArchive(
        organization: string,
        migration: number,
        url: string
    ) {
        const maxRetries = 3
        const timeoutDuration = 30000 // 30 seconds
        for (let retryCount = 1; retryCount <= maxRetries; retryCount++) {
            try {
                console.log(
                    `Requesting download of archive with migration_id: ${migration}...\n`
                )

                const archiveUrl = `${url}/archive`

                const archiveResponse = await axios.get(archiveUrl, {
                    responseType: 'stream',
                    headers: {
                        Authorization: `token ${process.env.GH_API_KEY}`
                    }
                })

                console.log('Creating filename...\n')
                // Create a name for the file which has the current date attached to it
                const filename = `gh_org_archive_${organization}_${new Date()
                    .toJSON()
                    .slice(0, 10)}.tar.gz`

                console.log(`Starting download to ${filename}...\n`)
                const writeStream = createWriteStream(filename)
                console.log('Downloading GitHub archive file...\n')
                archiveResponse.data.pipe(writeStream)

                return new Promise<void>((resolve, reject) => {
                    writeStream.on('finish', () => {
                        console.log('GitHub Migration download completed!\n')
                        // Upload archive to our own Azure Storage
                        uploadArchiveToAzure(filename)
                        // Deletes the migration archive. Migration archives are otherwise automatically deleted after seven days.
                        if (purgeMigration) {
                            console.log(
                                `Purging Github Migration ${migration} from ${organization} org...\n`
                            )
                            deleteArchiveFromGitHub(organization, migration)
                        }
                        console.log('Azure Backup completed! Goodbye.\n')
                        resolve()
                    })

                    writeStream.on('error', err => {
                        console.log(
                            'Error while uploading migration to Azure:',
                            err.message
                        )
                        reject(err)
                    })
                })
            } catch (error) {
                // Handle the API call error here
                console.error(
                    `Error occurred during attempt ${retryCount}:`,
                    error
                )
                // If it's the last retry, throw the error to be caught outside the loop
                if (retryCount === maxRetries) {
                    throw error
                }
                // If it's not the last retry, wait for the timeout before retrying
                console.log('Retrying in 30 seconds...\n')
                await sleep(timeoutDuration)
            }
        }
    }

    try {
        // Retrieve the migration data from the file
        const migration = await retrieveMigrationDataFromGitHub()

        // Need a migration status when entering the while loop for the first time
        let state = migration.state

        // Wait for status of migration to be exported
        while (state !== 'exported') {
            const check = await octokit.request(
                'GET /orgs/{org}/migrations/{migration_id}',
                {
                    org: organization,
                    migration_id: migration.id
                }
            )
            console.log(`State is ${check.data.state}... \n`)
            state = check.data.state
            await sleep(5000)
        }

        console.log(`State changed to ${state}!\n`)

        // Download archive from Github and upload it to our own S3 bucket
        transferArchive(organization, migration.id, migration.url)
    } catch (error) {
        console.error('Error occurred during download:', error)
    }
}

// Check if all variables are defined when not using Github Actions
if (!process.env.GITHUB_ACTIONS) {
    checkEnv()
}

runGitHubMigration(githubOrganization)
if (transferMigration) {
    // Start the download script when transferMigration is true
    runBackupToStorage(githubOrganization)
}
