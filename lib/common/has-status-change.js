module.exports = hasStatusChange

async function hasStatusChange (state, context) {
  const {data: {check_runs: checkRuns}} = await context.github.checks.listForRef(context.repo({
    ref: context.payload.pull_request.head.sha,
    check_name: 'WIP (beta)'
  }))

  if (checkRuns.length === 0) return true

  const [{conclusion, output}] = checkRuns
  const isWip = conclusion !== 'success'
  const hasOverride = output && /override/.test(output.title)

  return isWip !== state.status.wip || hasOverride !== state.status.override
}
