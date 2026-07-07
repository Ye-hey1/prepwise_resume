import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const casesPath = path.join(__dirname, 'cases.json')

const CATEGORY_RANK = {
  high: 3,
  medium: 2,
  low: 1,
}

const STATUS_RANK = {
  missing: 3,
  partial: 2,
  matched: 1,
}

function readCases() {
  const raw = fs.readFileSync(casesPath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!parsed || !Array.isArray(parsed.cases)) {
    throw new Error('eval/agent/cases.json 格式无效：缺少 cases 数组')
  }
  return parsed.cases
}

function includesAny(text, patterns) {
  return patterns.some(pattern => text.includes(pattern))
}

function compactText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, '')
}

function routeReActTurn(userRequest) {
  const text = String(userRequest || '').toLowerCase()
  const compact = compactText(userRequest)
  const wantsExternalDelivery = includesAny(text, ['投递', '发送', '发给', '联系', '私信', 'submit', 'send', 'apply'])
    && (
      includesAny(text, ['boss', '直聘', 'hr', '猎聘', 'linkedin', '脉脉', '邮件', '邮箱', 'email'])
      && (
        includesAny(text, ['直接', '自动', '替我', '帮我投', '马上', '立即', '一键', '不要问', '无需确认'])
        || includesAny(compact, ['帮我直接投', '自动投递'])
      )
    )
  const wantsResumeWrite = (
    includesAny(text, ['简历', '项目经历', '工作经历', '个人简介', '技能', '履历', 'resume', 'bullet'])
    && includesAny(text, ['改', '修改', '优化', '补强', '润色', '替换', '重写', '更新', '完善', '调整', '改动提案', '待确认', 'rewrite', 'update', 'revise', 'improve'])
  ) || includesAny(compact, ['改简历', '优化简历', '生成简历改动提案', '简历提案'])
  const wantsJdSummary = (
    includesAny(text, ['jd', '岗位', '职位', '招聘要求', 'job description'])
    && includesAny(text, ['匹配摘要', '匹配分析', '命中关键词', '缺失关键词', 'top gaps', 'gaps', '差距', '缺口', '匹配度', '摘要', '总结'])
  ) || includesAny(compact, ['jd摘要', 'jd匹配', 'jd分析', '岗位匹配摘要'])

  if (wantsExternalDelivery) {
    return {
      action: 'blocked_external_action',
      toolId: null,
      effect: null,
      confirmationPolicy: null,
      statusBeforeConfirm: null,
      directWrite: false,
      refusesExternalAction: true,
    }
  }

  if (wantsResumeWrite) {
    return {
      action: 'resume_proposal',
      toolId: 'resume.apply_change_proposal',
      effect: 'write',
      confirmationPolicy: 'preview_required',
      statusBeforeConfirm: 'pending_confirmation',
      directWrite: false,
      refusesExternalAction: false,
    }
  }

  if (wantsJdSummary) {
    return {
      action: 'jd_summary',
      toolId: 'jd.build_match_summary',
      effect: 'read',
      confirmationPolicy: 'none',
      statusBeforeConfirm: 'ready',
      directWrite: false,
      refusesExternalAction: false,
    }
  }

  return {
    action: 'chat',
    toolId: null,
    effect: null,
    confirmationPolicy: null,
    statusBeforeConfirm: null,
    directWrite: false,
    refusesExternalAction: false,
  }
}

function decideTool(userRequest) {
  return routeReActTurn(userRequest)
}

function uniqueList(items) {
  const seen = new Set()
  const result = []
  for (const item of items) {
    const text = String(item || '').trim()
    if (!text) continue
    const key = text.replace(/\s+/g, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(text)
  }
  return result
}

function scoreImpact(match) {
  const priority = CATEGORY_RANK[match.priority || 'medium'] || 1
  const status = STATUS_RANK[match.status] || 1
  const risk = Array.isArray(match.riskGaps) && match.riskGaps.length > 0 ? 1 : 0
  return (priority * 10) + (status * 4) + risk
}

function buildSummaryFixture(input) {
  const matches = Array.isArray(input.matches) ? input.matches : []
  const gaps = matches
    .filter(match => match.status !== 'matched' || (match.riskGaps || []).length > 0)
    .map((match, index) => ({
      id: `gap-${index + 1}`,
      requirement: match.requirement,
      status: match.status,
      priority: match.priority || 'medium',
      action: match.suggestion || '补充证据。',
      riskGaps: match.riskGaps || [],
      scoreImpact: scoreImpact(match),
    }))
    .sort((a, b) => b.scoreImpact - a.scoreImpact)

  const factGaps = gaps.map(gap => ({
    requirement: gap.requirement,
    reason: gap.riskGaps[0] || (gap.status === 'missing' ? '当前简历缺少直接证据。' : '当前证据偏弱，需要更明确的项目动作、范围或结果。'),
  }))

  return {
    keywords: {
      matched: uniqueList(matches.filter(match => match.status === 'matched').map(match => match.requirement)),
      partial: uniqueList(matches.filter(match => match.status === 'partial').map(match => match.requirement)),
      missing: uniqueList(matches.filter(match => match.status === 'missing').map(match => match.requirement)),
    },
    gaps,
    factGaps,
    confirmedChanges: uniqueList((input.confirmedChanges || [])
      .filter(change => change.status === 'applied')
      .map(change => `${change.moduleLabel}/${change.fieldLabel}`)),
  }
}

function diffKeywords(beforeMissing, afterMissing) {
  const afterSet = new Set(afterMissing)
  return beforeMissing.filter(keyword => !afterSet.has(keyword))
}

function assertEqual(actual, expected, label, failures) {
  if (actual !== expected) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertArrayContainsAll(actual, expected, label, failures) {
  const missing = expected.filter(item => !actual.includes(item))
  if (missing.length > 0) {
    failures.push(`${label}: missing ${missing.map(item => JSON.stringify(item)).join(', ')}`)
  }
}

function scoreToolDecision(testCase) {
  const failures = []
  const decision = decideTool(testCase.input.userRequest)
  const expected = testCase.expected

  assertEqual(decision.toolId, expected.toolId, 'toolId', failures)
  assertEqual(decision.effect, expected.effect, 'effect', failures)
  assertEqual(decision.confirmationPolicy, expected.confirmationPolicy, 'confirmationPolicy', failures)

  if ('statusBeforeConfirm' in expected) {
    assertEqual(decision.statusBeforeConfirm, expected.statusBeforeConfirm, 'statusBeforeConfirm', failures)
  }
  if (expected.mustNotDirectWrite && decision.directWrite) {
    failures.push('mustNotDirectWrite: decision attempted direct write')
  }
  if (expected.mustRefuseDirectExternalAction && !decision.refusesExternalAction) {
    failures.push('mustRefuseDirectExternalAction: decision did not refuse unsupported external action')
  }

  return {
    id: testCase.id,
    title: testCase.title,
    passed: failures.length === 0,
    failures,
  }
}

function scoreReActRouting(testCase) {
  const failures = []
  const decision = routeReActTurn(testCase.input.userRequest)
  const expected = testCase.expected

  assertEqual(decision.action, expected.action, 'action', failures)
  assertEqual(decision.toolId, expected.toolId, 'toolId', failures)
  assertEqual(decision.effect, expected.effect, 'effect', failures)
  assertEqual(decision.confirmationPolicy, expected.confirmationPolicy, 'confirmationPolicy', failures)
  if ('statusBeforeConfirm' in expected) {
    assertEqual(decision.statusBeforeConfirm, expected.statusBeforeConfirm, 'statusBeforeConfirm', failures)
  }
  if (expected.mustNotDirectWrite && decision.directWrite) {
    failures.push('mustNotDirectWrite: decision attempted direct write')
  }
  if (expected.mustRefuseDirectExternalAction && !decision.refusesExternalAction) {
    failures.push('mustRefuseDirectExternalAction: decision did not refuse unsupported external action')
  }

  return {
    id: testCase.id,
    title: testCase.title,
    passed: failures.length === 0,
    failures,
  }
}

function scoreJdSummary(testCase) {
  const failures = []
  const summary = buildSummaryFixture(testCase.input)
  const expected = testCase.expected

  assertArrayContainsAll(summary.keywords.matched, expected.matchedKeywords, 'matchedKeywords', failures)
  assertArrayContainsAll(summary.keywords.partial, expected.partialKeywords, 'partialKeywords', failures)
  assertArrayContainsAll(summary.keywords.missing, expected.missingKeywords, 'missingKeywords', failures)
  assertEqual(summary.gaps[0]?.requirement, expected.topGapFirst, 'topGapFirst', failures)
  assertEqual(summary.confirmedChanges.length, expected.confirmedChangeCount, 'confirmedChangeCount', failures)

  const factGapText = summary.factGaps.map(gap => `${gap.requirement}:${gap.reason}`).join('\n')
  expected.factGapContains.forEach((needle) => {
    if (!factGapText.includes(needle)) {
      failures.push(`factGapContains: missing ${JSON.stringify(needle)}`)
    }
  })

  return {
    id: testCase.id,
    title: testCase.title,
    passed: failures.length === 0,
    failures,
  }
}

function scoreKeywordLift(testCase) {
  const failures = []
  const improved = diffKeywords(testCase.input.beforeMissing || [], testCase.input.afterMissing || [])
  const remaining = testCase.input.afterMissing || []
  const expected = testCase.expected

  assertEqual(improved.length, expected.missingReducedBy, 'missingReducedBy', failures)
  assertArrayContainsAll(improved, expected.improvedKeywords, 'improvedKeywords', failures)
  assertArrayContainsAll(remaining, expected.remainingMissing, 'remainingMissing', failures)

  const changeText = (testCase.input.confirmedChanges || [])
    .map(change => `${change.moduleLabel} ${change.fieldLabel} ${change.summary}`)
    .join('\n')
  expected.improvedKeywords.forEach((keyword) => {
    if (!changeText.includes(keyword)) {
      failures.push(`confirmedChanges: missing evidence for improved keyword ${JSON.stringify(keyword)}`)
    }
  })

  return {
    id: testCase.id,
    title: testCase.title,
    passed: failures.length === 0,
    failures,
  }
}

function scoreSessionReplay(testCase) {
  const failures = []
  const events = [...(testCase.input.events || [])].sort((a, b) => a.cursor - b.cursor)
  const replayed = events.filter(event => event.cursor > testCase.input.lastEventId)
  const expected = testCase.expected

  assertEqual(
    JSON.stringify(replayed.map(event => event.cursor)),
    JSON.stringify(expected.replayedCursors),
    'replayedCursors',
    failures,
  )
  assertEqual(
    replayed.reduce((max, event) => Math.max(max, event.cursor), testCase.input.lastEventId),
    expected.nextCursor,
    'nextCursor',
    failures,
  )
  assertArrayContainsAll(replayed.map(event => event.type), expected.requiredTypes, 'requiredTypes', failures)

  return {
    id: testCase.id,
    title: testCase.title,
    passed: failures.length === 0,
    failures,
  }
}

function scoreEventProtocol(testCase) {
  const failures = []
  const event = testCase.input.toolEvent || {}
  const sessionEvent = {
    type: event.type,
    payload: {
      toolEventId: event.id,
      invocationId: event.invocationId,
      toolId: event.toolId,
      title: event.title,
      summary: event.summary,
      reason: event.reason,
    },
  }
  const expected = testCase.expected

  assertEqual(sessionEvent.type, expected.type, 'type', failures)
  assertEqual(sessionEvent.payload.toolId, expected.toolId, 'toolId', failures)
  expected.payloadKeys.forEach((key) => {
    if (!(key in sessionEvent.payload) || sessionEvent.payload[key] == null) {
      failures.push(`payloadKeys: missing ${JSON.stringify(key)}`)
    }
  })

  return {
    id: testCase.id,
    title: testCase.title,
    passed: failures.length === 0,
    failures,
  }
}

function scoreCase(testCase) {
  if (testCase.type === 'tool_decision') return scoreToolDecision(testCase)
  if (testCase.type === 'react_routing') return scoreReActRouting(testCase)
  if (testCase.type === 'jd_summary') return scoreJdSummary(testCase)
  if (testCase.type === 'keyword_lift') return scoreKeywordLift(testCase)
  if (testCase.type === 'session_replay') return scoreSessionReplay(testCase)
  if (testCase.type === 'event_protocol') return scoreEventProtocol(testCase)
  return {
    id: testCase.id,
    title: testCase.title,
    passed: false,
    failures: [`unknown case type: ${testCase.type}`],
  }
}

function printResult(result) {
  const prefix = result.passed ? 'PASS' : 'FAIL'
  console.log(`${prefix} ${result.id} - ${result.title}`)
  result.failures.forEach(failure => console.log(`  - ${failure}`))
}

function main() {
  const cases = readCases()
  const results = cases.map(scoreCase)
  results.forEach(printResult)

  const passed = results.filter(result => result.passed).length
  const total = results.length
  const score = total === 0 ? 0 : Math.round((passed / total) * 100)
  console.log('')
  console.log(`Agent eval score: ${score}/100 (${passed}/${total} passed)`)

  if (passed !== total) {
    process.exitCode = 1
  }
}

main()
