module.exports = handlePullRequestChange

const getStatusFree = require('./free/get-status')
const getStatusPor = require('./pro/get-status')
const getCurrentStatus = require('./common/get-current-status')
const getPlan = require('./common/get-plan')

const locationLabel = {
  title: 'title',
  label_name: 'label',
  commit_subject: 'commit subject'
}

async function handlePullRequestChange (app, context) {
  const pullRequest = context.payload.pull_request
  const accountId = context.payload.repository.owner.id
  const state = {
    accountId,
    url: pullRequest.html_url,
    title: pullRequest.title
  }

  try {
    // 1. get new status based on marketplace plan
    state.plan = await getPlan(app, accountId)
    state.status = state.plan === 'free' ? await getStatusFree(context) : await getStatusPor(context)

    // 2. if status did not change then don’t create a new check run. Quotas for
    //    mutations are more restrictive so we want to avoid them if possible
    const currentStatus = await getCurrentStatus(context)

    state.status.changed = state.status.wip !== currentStatus.wip || state.status.override !== currentStatus.override

    if (!state.status.changed) {
      return context.log.info(state)
    }

    // 3. Create check run
    const status = state.status.wip ? 'in_progress' : 'completed'
    const conclusion = state.status.wip ? undefined : 'success'
    const completedAt = status === 'completed' ? new Date() : undefined

    const output = {
      title: state.status.wip ? 'Work in progress' : 'Ready for review',
      summary: state.status.wip
        ? `The ${locationLabel[state.status.location]} "${state.status.text}" contains "${state.status.match}".`
        : `No match found based on configuration`,
      text: state.plan === 'free'
        ? `By default, WIP only checks the pull request title for the terms "WIP", "Work in progress" and "🚧".

You can configure both the terms and the location that the WIP app will look for by signing up for the pro plan: https://github.com/marketplace/wip.
All revenue will be donated to [Rails Girls Summer of Code](https://railsgirlssummerofcode.org/).`
        : state.status.config
          ? `The following configuration from \`.github/wip.yml\` was applied:

\`\`\`yaml
${state.status.config}
\`\`\``
          : `\`.github/wip.yml\` does not exist, the default configuration is applied:

\`\`\`yaml
terms:
  - wip
  - work in progress
  - 🚧
locations: title
\`\`\`

Read more about [WIP configuration](#tbd)`
    }
    const actions = []

    if (state.plan === 'pro' && state.status.wip) {
      output.summary += '\n\nYou can override the status by adding "@wip ready for review" to the end of the pull request description.'
      actions.push({
        label: '✅ Ready for review',
        description: 'override status to "success"',
        identifier: `override:${pullRequest.number}`
      })
    }

    if (state.status.override) {
      output.title += ' (override)'
      output.summary = 'The status has been set to success by adding `@wip ready for review` to the pull request comment. You can reset the status by removing it.'
      output.details = 'Learn more about [WIP override](#tbd)'
      actions.push({
        label: '🔄 Reset',
        description: 'Remove status override',
        identifier: `reset:${pullRequest.number}`
      })
    }

    await context.github.checks.create(context.repo({
      name: 'WIP (beta)',
      head_branch: '', // workaround for https://github.com/octokit/rest.js/issues/874
      head_sha: pullRequest.head.sha,
      status,
      completed_at: completedAt,
      conclusion,
      output,
      actions
    }))

    context.log.info(state)
  } catch (error) {
    context.log.error({
      ...state,
      error: {
        name: error.name,
        code: error.code,
        message: error.message,
        stack: error.stack
      }
    })
  }
}
