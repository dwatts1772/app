module.exports = handlePullRequestChange

const getStatusFree = require('./free/get-status')
const setStatusFree = require('./free/set-status')

const getStatusPro = require('./pro/get-status')
const setStatusPro = require('./pro/set-status')

const hasStatusChange = require('./common/has-status-change')
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
    state.status = state.plan === 'free' ? await getStatusFree(context) : await getStatusPro(context)

    // 2. if status did not change then don’t create a new check run. Quotas for
    //    mutations are more restrictive so we want to avoid them if possible
    state.status.changed = await hasStatusChange(state, context)
    if (!state.status.changed) {
      return context.log.info(state)
    }

    // 3. Create check run
    if (state.plan === 'free') {
      await setStatusFree(state, context)
    } else {
      await setStatusPro(state, context)
    }

    context.log.info(state)
  } catch (error) {
    context.log.error({
      ...state,
      // error objects are not destructured correctly, so doing it by hand
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      }
    })
  }
}
