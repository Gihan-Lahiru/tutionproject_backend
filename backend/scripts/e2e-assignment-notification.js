/* eslint-disable no-console */

const baseUrl = process.env.BASE_URL || 'http://localhost:5001'

async function request(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }

  return { status: res.status, json }
}

async function login(email, password) {
  const out = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  if (out.status !== 200) {
    throw new Error(`Login failed ${email}: ${out.status} ${JSON.stringify(out.json)}`)
  }
  const token = out.json?.token
  if (!token) {
    throw new Error(`No token for ${email}: ${JSON.stringify(out.json)}`)
  }
  return token
}

async function main() {
  console.log('BASE_URL', baseUrl)
  console.log('health', await request('/api/health'))

  const teacherToken = await login('teacher@tuitionsir.com', 'teacher123')
  console.log('teacher ok')

  const title = `Algebra HW ${new Date().toISOString()}`
  const create = await request('/api/assignments/class/sample-class-1', {
    method: 'POST',
    token: teacherToken,
    body: {
      title,
      description: 'Solve questions 1-5',
      due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
  })
  console.log('create assignment', create.status)
  console.log(create.json)

  const studentToken = await login('alice@student.com', 'student123')
  console.log('student ok')

  const notifs = await request('/api/notifications/my-notifications', { token: studentToken })
  console.log('notifications', notifs.status)

  const items = Array.isArray(notifs.json?.notifications)
    ? notifs.json.notifications
    : Array.isArray(notifs.json)
      ? notifs.json
      : []

  const match = items.find((n) => typeof n?.message === 'string' && n.message.includes(title))
  console.log('assignment notification found?', Boolean(match))
  if (match) {
    console.log('match', {
      id: match.id,
      type: match.type,
      message: match.message,
      created_at: match.created_at,
    })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
