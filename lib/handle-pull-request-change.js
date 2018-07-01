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

    // 2. if status did not change then don’t call .createStatus. Quotas for
    //    mutations are more restrictive so we want to avoid them if possible
    const currentStatus = await getCurrentStatus(context)

    state.status.changed = state.status.wip !== currentStatus.wip

    if (!state.status.changed) {
      return context.log.info(state)
    }

    // 3. Create check run
    const conclusion = state.status.wip ? 'action_required' : 'success'
    const output = {
      title: state.status.wip ? 'Work in progress' : 'Ready for review',
      summary: state.status.wip
        ? `The ${locationLabel[state.status.location]} "${state.status.text}" contains "${state.status.match}".

You can override the status by adding "@wip ready for review" to the end of the pull request description`
        : `No match found based on configuration`,
      text: `TO BE DONE: show current configuration for paid plan, show something meaningful for free plan`
    }
    const actions = []

    if (state.status.wip) {
      actions.push({
        label: '✅ Ready for review',
        description: 'override status to "success"',
        identifier: `override:${pullRequest.number}`
      })
    }

    if (state.status.override) {
      output.title += ' (override)'
      actions.push({
        label: '🔄 Reset',
        description: 'Remove status override',
        identifier: `reset:${pullRequest.number}`
      })
    }

    await context.github.checks.create(context.repo({
      owner: 'wip',
      repo: 'sandbox',
      name: 'WIP (beta)',
      head_branch: '', // workaround for https://github.com/octokit/rest.js/issues/874
      head_sha: pullRequest.head.sha,
      status: 'completed',
      conclusion,
      completed_at: new Date(),
      output,
      actions
    }))

    context.log.info(state)
  } catch (error) {
    context.log.error({...state, error})
  }
}
