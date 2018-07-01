module.exports = handlePullRequestChange

const getStatusFree = require('./free/get-status')
const getStatusPor = require('./pro/get-status')
const getCurrentStatus = require('./common/get-current-status')
const getPlan = require('./common/get-plan')

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

    state.changed = state.status !== currentStatus
    const description = state.status === 'pending' ? 'work in progress' : 'ready'

    if (!state.changed) {
      return context.log.info(state)
    }

    // 3. Set new status
    await context.github.repos.createStatus(context.repo({
      sha: pullRequest.head.sha,
      state: state.status,
      target_url: 'https://github.com/apps/wip',
      description,
      context: 'WIP (beta)'
    }))

    context.log.info(state)
  } catch (error) {
    context.log.error({...state, error})
  }
}
