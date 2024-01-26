<a href="https://skrepr.com/">
  <p align="center">
    <img width="200" height="100" src="https://cdn.skrepr.com/logo/skrepr_liggend.svg" alt="skrepr_logo" alt="skrepr" />
  </p>
</a>
<h1 align="center">Github Backup Action</h1>
<div align="center">
  <a href="https://github.com/TCARE1/github-backup-action/releases"><img src="https://img.shields.io/github/release/TCARE1/github-backup-action.svg" alt="Releases"/></a><a> </a>
  <a href="https://github.com/TCARE1/github-backup-action/blob/main/LICENSE"><img src="https://img.shields.io/github/license/TCARE1/github-backup-action.svg" alt="LICENSE"/></a><a> </a>
  <a href="https://github.com/TCARE1/github-backup-action/issues"><img src="https://img.shields.io/github/issues/TCARE1/github-backup-action.svg" alt="Issues"/></a><a> </a>
  <a href="https://github.com/TCARE1/github-backup-action/pulls"><img src="https://img.shields.io/github/issues-pr/TCARE1/github-backup-action.svg" alt="PR"/></a><a> </a>
  <a href="https://github.com/TCARE1/github-backup-action/commits"><img src="https://img.shields.io/github/commit-activity/m/TCARE1/github-backup-action" alt="Commits"/></a><a> </a>
  <a href="https://github.com/TCARE1/github-backup-action/stars"><img src="https://img.shields.io/github/stars/TCARE1/github-backup-action.svg" alt="Stars"/></a><a> </a>
  <a href="https://github.com/TCARE1/github-backup-action/releases"><img src="https://img.shields.io/github/forks/TCARE1/github-backup-action.svg" alt="Forks"/></a><a> </a>
</div>

# About

This GitHub Action allows you to backup and archive an organization repository to an Azure Storage Account with the help of the [GitHub Organization migrations API](https://docs.github.com/en/rest/migrations/orgs#start-an-organization-migration)

# Requirements

The Migrations API is only available to authenticated organization owners. For more information, see "Roles in an organization" and "Other authentication methods."

Ensure that you have owner permissions on the source organization's repositories.
[Generate an access token](https://docs.github.com/en/enterprise-server@3.6/articles/creating-an-access-token-for-command-line-use) with the `repo` and `admin:org` scopes on GitHub.com. Make sure your token has access to the organizations you are working with (this may be explicitly needed in the case of SSO).
To minimize downtime, make a list of repositories you want to export from the source instance. You can add multiple repositories to an export at once using a text file that lists the URL of each repository on a separate line. If no repositories are specified, all repositories will be included.

# Commands

To build the project: `npm run build`
To watch the project during developement: `npm run watch`
To run the script: `node dist/main.ts`
List all repos: `curl "https://api.github.com/orgs/skrepr/repos" \
     -u 'username:<personal access token>'`
# Github Action example config

## Create archive

```yaml
name: Backup repositories

on:
  schedule:
    - cron: '0 1 * * 0'  # e.g, at 01:00 on Sunday

jobs:
  backup:
    name: Create archive
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
    - name: GitHub Migrations Backup
      uses: TCARE/github-backup-action@0.9.10
      with:
        github-organization: "your-organization-here"
        github-apikey: ${{ secrets.YOUR_GITHUB_TOKEN }}
        azure-container-name: "your-container-here"
        azure-connection-string: ${{ secrets.AZURE_CONNECTION_STRING }} # Github Secret is advised

    # Save migration.data.id as an artifact at the end of the first run
    - name: Archive Data
      uses: actions/upload-artifact@v2
      with:
        name: migration-data
        path: migration_response.json
```

## Download archive

```yaml
name: Download archive

on:
  schedule:
    - cron: '0 3 * * 0'  # At 03:00 on Sunday

jobs:
  backup:
    name: Download archive
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:

    # Download the migration.data.id as an artifact at the beginning of the second run
    - name: Archive Data
      uses: actions/download-artifact@v2
      with:
        name: migration-data
        path: migration_response.json

    - name: GitHub Migrations Backup
      uses: TCARE1/github-backup-action@0.9.0
      with:
        transfer-migration: true
        purge-migration: false
        github-organization: "your-organization-here"
        github-apikey: ${{ secrets.YOUR_GITHUB_TOKEN }}
        azure-container-name: "your-container-here"
        azure-connection-string: ${{ secrets.AZURE_CONNECTION_STRING }} # Github Secret is advised
```

# Azure Connection String

Generate a connection string with the "Shared access signature" blade on your chosen Azure Storage Account ensure it has:
- Allowed Services = Blob
- Allowed resource types = { Container, Object }
- Allowed permissions = { Read, Write, List, Add, Create } 

# Recovering your repositories from the archive

GitHub Migrations only archives your .git from every repository.

To recover your code from the archive:

1. Place all the repo.git files in a .git folder.
2. Execute the command `git init`
3. After Git has reinitialized the project, execute `git reset --hard HEAD`


## License

MIT / BSD

## Author Information

This Github Action was created in 2022 by [Jeroen van der Meulen](https://github.com/jeroenvandermeulen), commisioned by [Skrepr](https://skrepr.com)
