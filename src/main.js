(function () {
  const args = parseArgs()
  if (args.options.help || args.command === '') {
    usage()
  } else {
    runCommand(args.command, args.options)
      .then(msg => {
        if (msg) {
          console.log(msg)
        }
      })
      .catch(err => {
        console.log(err)
      })
  }
})()

function runCommand (cmd, options) {
  switch (cmd) {
    case 'default': {
      if (options.help) {
        delete options.help
      }
      updateConfig(options)
      return Promise.resolve()
    }
    case 'list': {
      options = mergeDefaultOptions(options)
      const auth = getAuthorization(options.username, options.password)
      const r = options.repository
      const f = options.filters
      const o = options.output || 'text'
      const n = options.number || Number.MAX_VALUE
      if (r === undefined) {
        return listRepositories(options.server, auth, f, n, o)
      } else {
        return listComponents(options.server, auth, r, f, n, o)
      }
    }
    case 'delete': {
      options = mergeDefaultOptions(options)
      const auth = getAuthorization(options.username, options.password)
      const r = options.repository
      if (r === undefined) {
        return Promise.reject('missing repository (-r)')
      }
      const f = options.filters
      const n = options.number || Number.MAX_VALUE
      return deleteComponents(options.server, auth, r, f, n)
    }
    default:
      return Promise.reject(`unknown command: ${cmd}`)
  }
}

function parseArgs () {
  let command = ''
  const options = {}
  const arr = process.argv.slice(2)
  for (; ;) {
    const v = arr.shift()
    if (v === undefined) {
      break
    }
    switch (v) {
      case '-s':
      case '--server':
        options.server = arr.shift()
        break
      case '-u':
      case '--username':
        options.username = arr.shift()
        break
      case '-p':
      case '--password':
        options.password = arr.shift()
        break
      case '-r':
      case '--repository':
        options.repository = arr.shift()
        break
      case '-f':
      case '--filter': {
        const filter = arr.shift()
        const r = /^([a-zA-Z0-9_]+)([~:><])(.+)$/
        const m = r.exec(filter)
        if (!m) {
          console.log(`invalid filter format: ${filter}`)
          process.exit(1)
        }
        if (!options.filters) {
          options.filters = []
        }
        options.filters.push({
          attr: m[1],
          match: makeMatcher(m[2], m[3])
        })
        break
      }
      case '-n':
      case '--number':
        options.number = arr.shift()
        break
      case '-o':
      case '--output':
        options.output = arr.shift()
        break
      case '-h':
      case '--help':
        options.help = true
        break
      case 'default':
        command = 'default'
        break
      case 'ls':
      case 'list':
        command = 'list'
        break
      case 'delete':
      case 'del':
        command = 'delete'
        break
      default:
        console.log(`unknown flag: ${v}`)
        process.exit(1)
        break
    }
  }
  return {
    command: command,
    options: options
  }
}

function usage () {
  console.log(`nexus-cli <command> [options]

commands:
    default      set default options to ~/.nexus/config.json .
    ls, list     list repository or components
    del, delete  delete components

options:
    -s, --server     <url>       Specify nexus server url.
    -u, --username   <username>  Specify username.
    -p, --password   <password>  Specify password.
    -r, --repository <name>      Specify name of repository.
    -f, --filter     <pattern>   Add filter pattern, 
                                 repositories/components which match all patterns are listed.
                                 Support multiple --filter flags.
    -n, --number     <count>     Specify count of repositories/components listed.
    -o, --output     <format>    Specify output format: text, json.
    -h, --help                   Show help.
`)
}

function mergeDefaultOptions (options) {
  const conf = readConfig()
  if (conf) {
    Object.keys(conf).forEach(key => {
      if (!(key in options)) {
        options[key] = conf[key]
      }
    })
  }
  if (options.server) {
    if (options.server.slice(-1) === '/') {
      options.server = options.server.slice(0, -1)
    }
    if (!/service\/rest\$/.test(options.server)) {
      options.server += '/service/rest'
    }
  }
  options.filters = options.filters || []
  return options
}

function readConfig () {
  const path = require('path')
  const fs = require('fs')
  const file = path.resolve(process.env['HOME'], '.nexus/config.json')
  if (fs.existsSync(file)) {
    return require(file)
  }
}

function makeMatcher (type, patternStr) {
  switch (type) {
    case '~':
      try {
        const r = new RegExp(patternStr)
        return v => r.test(v)
      } catch (e) {
        console.log(`invalid filter format: ${filter}`)
        process.exit(1)
      }
      break
    case ':':
      return v => v.indexOf(patternStr) >= 0
    case '>': {
      const p = parseVersion(patternStr)
      return v => compareVersion(parseVersion(v), p) > 0
    }
    case '<': {
      const p = parseVersion(patternStr)
      return v => compareVersion(parseVersion(v), p) < 0
    }
  }
}

function getAuthorization (u, p) {
  let auth = `${u}:${p}`
  auth = new Buffer(auth).toString('base64')
  return `Basic ${auth}`
}

function request (method, path, qs, headers, body) {
  const url = require('url')
  const http = require('https')
  const u = url.parse(path)
  const opts = {
    method: method,
    hostname: u.hostname,
    port: u.port,
    path: u.path,
    headers: {
      'WWW-Authenticate': 'BASIC realm="Sonatype Nexus Repository Manager"',
    },
  }
  if (headers) {
    Object.assign(opts.headers, headers)
  }
  if (qs) {
    const arr = Object.keys(qs)
    if (arr.length > 0) {
      const key = arr.shift()
      let qsStr = '?' + key + '=' + encodeURIComponent(qs[key])
      arr.forEach(key => {
        qsStr += '&' + key + '=' + encodeURIComponent(qs[key])
      })
      opts.path += qsStr
    }
  }
  if (body) {
    opts.headers['Content-Type'] = 'application/json'
  }
  return new Promise((resolve, reject) => {
    const req = http.request(opts, resp => {
      const arr = []
      resp.on('data', buf => {
        arr.push(buf)
      })
      resp.on('end', () => {
        const msg = arr.length ? Buffer.concat(arr).toString() : ''
        if (resp.statusCode < 200 || resp.statusCode > 299) {
          const err = new Error(resp.statusCode + ' - ' + resp.statusMessage +
            (msg ? ' - ' + msg : ''))
          err.statusCode = resp.statusCode
          reject(err)
        } else {
          if (msg) {
            try {
              resolve(JSON.parse(msg))
            } catch (err) {
              reject(err)
            }
          } else {
            resolve(null)
          }
        }
      })
      resp.on('error', reject)
    })
    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
    req.on('error', reject)
  })
}

function updateConfig (conf) {
  const path = require('path')
  const fs = require('fs')
  const dir = path.resolve(process.env['HOME'], '.nexus')
  const file = path.resolve(dir, 'config.json')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
  fs.writeFileSync(file, JSON.stringify(conf))
}

function listRepositories (baseURL, auth, filters, number, output) {
  return request('GET', `${baseURL}/beta/repositories`, {}, {
    'Authorization': auth
  }).then(resp => {
    const arr = []
    filter(resp, filters, number, v => {
      arr.push(v)
    })
    arr.sort((a, b) => a.name > b.name ? 1 : a.name < b.name ? -1 : 0)
    switch (output) {
      case 'text':
        arr.forEach(v => {
          console.log(`${v.name} (${v.format}:${v.type})`)
        })
        break
      case 'json':
        arr.forEach(v => {
          console.log(v)
        })
        break
      default:
        return Promise.reject('unknown output format')
    }
  })
}

function listComponents (baseURL, auth, repository, filters, number, output) {
  return fetchComponents(baseURL, auth, repository, filters, number).then(arr => {
    if (arr.length > 0) {
      switch (output) {
        case 'text':
          arr.forEach(v => {
            switch (v.format) {
              case 'maven2':
                console.log(`${v.group}:${v.name}:${v.version}`)
                break
              case 'docker':
                console.log(`${v.name}:${v.version}`)
                break
              case 'npm':
                console.log(`${v.name}:${v.version}`)
                break
            }
          })
          break
        case 'json':
          arr.forEach(v => {
            console.log(v)
          })
          break
        default:
          return Promise.reject('unknown output format')
      }
    } else {
      console.log('No matched components')
    }
  })
}

function fetchComponents (baseURL, auth, repository, filters, number) {
  function fetch (results, count, token) {
    const qs = {
      repository: repository
    }
    if (token) {
      qs.continuationToken = token
    }
    return request('GET', `${baseURL}/beta/components`, qs, {
      'Authorization': auth
    }).then(resp => {
      process.stdout.write('.')
      const left = filter(resp.items, filters, count, v => {
        results.push(v)
      })
      if (left > 0 && resp.continuationToken) {
        return fetch(results, left, resp.continuationToken)
      } else {
        process.stdout.write('\n')
        results.sort((a, b) =>
          a.group > b.group ? 1 : a.group < b.group ? -1 :
            a.name > b.name ? 1 : a.name < b.name ? -1 :
              compareVersion(parseVersion(a.version), parseVersion(b.version))
        )
        return results
      }
    })
  }

  return fetch([], number)
}

function filter (arr, filters, n, cb) {
  let i = 0, c = n
  for (; c > 0 && i < arr.length; i++) {
    const v = arr[i]
    if (matchFilters(filters, v)) {
      cb(v)
      c--
    }
  }
  return c
}

function matchFilters (filters, v) {
  for (let k = 0; k < filters.length; k++) {
    const r = filters[k]
    const a = v[r.attr]
    if (a === undefined || !r.match(a)) {
      return false
    }
  }
  return true
}

function parseVersion (v) {
  const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)(-(\w+))?$/.exec(v)
  return m && [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), m[5] || '']
}

function compareVersion (a, b) {
  return (!a || !b) ? 0
    : a[0] > b[0] ? 1
      : a[0] < b[0] ? -1
        : a[1] > b[1] ? 1
          : a[1] < b[1] ? -1
            : a[2] > b[2] ? 1
              : a[2] < b[2] ? -1 : 0
}

function deleteComponents (baseURL, auth, repository, filters, number) {
  function del (arr) {
    if (arr.length > 0) {
      const v = arr.shift()
      process.stdout.write(`deleting ${v.group}:${v.name}:${v.version} ... `)
      request('DELETE', `${baseURL}/beta/components/${v.id}`, {}, {
        'Authorization': auth
      }).then(() => {
        console.log('deleted')
      }, err => {
        console.log(`\n${err}`)
      }).then(() => {
        return del(arr)
      })
    }
  }

  return fetchComponents(baseURL, auth, repository, filters, number).then(arr => {
    if (arr.length > 0) {
      arr.forEach(v => {
        console.log(`${v.group}:${v.name}:${v.version}`)
      })
      return question('Delete these components? [y/N] ').then(answer => {
        if (answer.toLowerCase() === 'y') {
          return del(arr)
        }
      })
    } else {
      console.log('No matched components')
    }
  })
}

function question (q) {
  const readline = require('readline')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise(resolve => {
    rl.question(q, answer => {
      rl.close()
      resolve(answer)
    })
  })
}