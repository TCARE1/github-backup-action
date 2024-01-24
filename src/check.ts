// Check if all the variables necessary are defined when not using Github Actions
export function checkEnv(): void {
    const requiredVariables = [
        'GH_ORG',
        'GH_API_KEY',
        'AZURE_CONNECTION_STRING',
        'AZURE_CONTAINER_NAME'
    ]

    for (const variable of requiredVariables) {
        if (!process.env[variable]) {
            throw new Error(`${variable} is undefined`)
        }
    }
}
