# codebase-audit workflow 

## n8n-runner-service service
For this to work, we need to make a simple n8n-runner-service which is a typescript fastify service. 

It needs:
POST `/api/v1/runners/audit-repo`
with body: `{ repo: string }`
returns `{ runnerId }`
GET `/api/v1/runners/audit-repo/{runnerId}`
returns `{ status: "pending" } | { status: "failed", message: string } | { status: "completed", auditResult: { mrUrl?: string } }`
POST `/api/v1/runners/audit-repo/{runnerId}/report`

NOTE: 
- Use SQLite for any tracking. Use drizzle as the ORM
- This service container mounts /var/run/docker.sock so it can access docker

## audit-runner container
The audit goes as follows:
- Workspace directory, `/tmp/github/workpad/`
- `git clone <repo>` 
- `git checkout -b audit` 
- Glob each folder with `package.json` (Node)
- In each folder, check if using npm or pnpm. Run `npm/pnpm ci`
- Run `npm/pnpm audit --audit-level=medium --json` 
- If have, then `npm/pnpm audit fix` If have issues, track
- Create MR `[AUDIT] Fix CVEs` if it doesnt exist.
- Categorise with the description, `[NODE] <folder>: .... <List of issues + Recommendations>`
- Return the result with `completed`, `/api/v1/runners/audit-repo/{runnerId}/report`
- Concurrently, every 10s, if the runner is sitll running, use  `/api/v1/runners/audit-repo/{runnerId}/report` to report `pending`.

NOTE:
- Use simple-git for handling git
- You will be given a PAT for github

## The Workflow
- Every day at 6am, this workflow triggers.
- Create a script that manages the auditting. For a predefined set of repos configured as a JSON file, for each repo in
```json
{ "repos": ["Acrylic125/mgt", "Acrylic125/fstars"] }
```
  - Call `/api/v1/runners/audit-repo` for the repo
  - We do max 3 at a time.
  - Use `/api/v1/runners/audit-repo/{runnerId}` to poll every 5s to check whether it is complete.
  - Collate the results for all the runs
- Once this job is done, report back to telegram with a SINGULAR MESSAGE consolidating the result.
  - If fail for whatever reason. 
    - `<Repo>: Failed Audit due to <error>`
  - If flow success, track:
    - If no need for MR, `<Repo>: Audited with no issues`
    - Else: `<Repo>: Audited <MR link>`
  - Else, `[Repo Audit] Finished Repo Audit`
    - \<Tracked>

## Validation
1. Ask me to configure what needs to be configured. Give explicit instructions on the setup.
2. Only when everything is configured, go to http://localhost:5678/projects/e4XnDlLQYk958DJF/workflows to validate the workflow.