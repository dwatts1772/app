module.exports = wip

const handlePullRequestChange = require('./lib/handle-pull-request-change')

function wip (app) {
  app.on([
    'pull_request.opened',
    'pull_request.edited',
    'pull_request.labeled',
    'pull_request.unlabeled',
    'pull_request.synchronize'
  ], handlePullRequestChange.bind(null, app))
}
