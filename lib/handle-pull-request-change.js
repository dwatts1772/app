module.exports = handlePullRequestChange

async function handlePullRequestChange (robot, context) {
  // find out if user as pro plan or not.
  // The request to check the installation for the current account (user account_id
  // or organization) needs to beauthenticated as the app, not installation.
  // If the app has no plan it means that it wasn’t installed from the marketplace
  // but from github.com/app/wip
  const authenticatedAsApp = await robot.auth()
  try {
    const {data} = await authenticatedAsApp.apps.checkMarketplaceListingAccount({
      account_id: context.payload.repository.owner.id
    })

    if (data.marketplace_purchase.plan.price_model === 'FREE') {
      console.log('FREE PLAN')
    } else {
      console.log('PRO PLAN')
    }
  } catch (error) {
    if (error.code === 404) {
      console.log('FREE PLAN (not installed)')
    }

    throw error
  }

  const {pull_request: pr} = context.payload
  const currentStatus = await getCurrentStatus(context)
  const labelNames = pr.labels.map(label => label.name)
  const isWip = containsWIP(pr.title) || labelNames.some(containsWIP) || await commitsContainWIP(context)
  const newStatus = isWip ? 'pending' : 'success'
  const logLabel = `${pr.html_url} "${pr.title}"`

  // if status did not change then don’t call .createStatus. Quotas for mutations
  // are much more restrictive so we want to avoid them if possible
  if (currentStatus === newStatus) {
    return console.log(`${logLabel} — ${currentStatus} (unchanged)`)
  }

  try {
    await context.github.repos.createStatus(context.repo({
      sha: pr.head.sha,
      state: newStatus,
      target_url: 'https://github.com/apps/wip',
      description: isWip ? 'work in progress' : 'ready for review',
      context: 'WIP (beta)'
    }))
    console.log(`${logLabel} — ${newStatus}`)
  } catch (error) {
    console.log(`${logLabel} — ${error}`)
  }
}

async function getCurrentStatus (context) {
  const {data: {statuses}} = await context.github.repos.getCombinedStatusForRef(context.repo({
    ref: context.payload.pull_request.head.sha
  }))

  return (statuses.find(status => status.context === 'WIP') || {}).state
}

async function commitsContainWIP (context) {
  const commits = await context.github.pullRequests.getCommits(context.repo({
    number: context.payload.pull_request.number
  }))

  return commits.data.map(element => element.commit.message).some(containsWIP)
}

function containsWIP (string) {
  return /\b(wip|do not merge|work in progress)\b/i.test(string)
}
