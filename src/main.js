// import path from 'path'
import { NodeClient, ContractClient } from 'mazzaroth-js'
import util from 'util'
import program from 'commander'
import fs from 'fs'
import { exec } from 'child_process'
import path from 'path'
import assert from 'assert'
import { sha3_256 as sha3256 } from 'js-sha3'
require('app-module-path').addPath(path.resolve(`${__dirname}/../node_modules`))

const runCmd = util.promisify(exec)

const defaultChannel = '0'.repeat(64)
const defaultSender = '0'.repeat(64)
const defaultOwner = '3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29'
const defaultAddr = 'http://localhost:8081'
const defaultConfig = 'configs'

function getAbi (abi) {
  if (abi['type'] === 'config') {
    return abi['value']
  }
  if (abi['type'] === 'file') {
    return JSON.parse(fs.readFileSync(abi['value']))
  }
  return []
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const testCmd = program.command('test')
const testDesc = `
Runs some integrations tests based on a test config.

Examples:
  mazzaroth-it test test_config.json
`

testCmd.description(testDesc)
  .option('-c --config <s>',
    `Web address of the host node default: ${defaultConfig}`)
  .option('-n --skip_docker',
    `Whether to skip docker startup before running the tests.`)

testCmd.action(async function (options) {
  const configPath = options.config || defaultConfig
  console.log(configPath)
  if (fs.lstatSync(configPath).isDirectory()) {
    fs.readdir(configPath, async function (err, items) {
      if (err) {
        console.log(err)
        return
      }
      for (let i = 0; i < items.length; i++) {
        // ignore . files
        if (items[i][0] === '.') {
          continue
        }
        const fullPath = path.join(configPath, items[i])
        console.log('----------------------------------')
        console.log(`Running test config ${fullPath}`)
        console.log('----------------------------------')
        const config = JSON.parse(fs.readFileSync(fullPath))
        await runTest(config, options.skip_docker)
      }
    })
  } else {
    const config = JSON.parse(fs.readFileSync(configPath))
    await runTest(config, options.skip_docker)
  }
})

async function runTest (config, skipDocker) {
  const channel = defaultChannel || config['channel-id']
  const host = config['node-addr'] || defaultAddr
  const testSets = config['test-sets']
  const warmupMs = config['warmup-ms'] || 1000
  const deployMs = config['deploy-ms'] || 3000
  const transactionMs = config['transaction-ms'] || 3000
  const maxBlockExpirations = 5
  const abi = getAbi(config['abi'])
  let xdrTypes = {}
  if (config['xdr-types']) {
    xdrTypes = require(path.resolve(config['xdr-types']))
  }
  const wasmFile = fs.readFileSync(config['contract'])
  const action = {
    channelID: config.channel_id || defaultChannel,
    nonce: '1',
    blockExpirationNumber: '5',
    category: {
      type: 2,
      data: {
        type: 1,
        data: {
          contractBytes: wasmFile.toString('base64'),
          abi: abi,
          contractHash: sha3256.create().update(wasmFile.buffer).hex(),
          version: '0.1'
        }
      }
    }
  }

  for (const setName in testSets) {
    let testOutput = ''
    let killed = false
    let containerID = ''
    if (!skipDocker) {
    // docker run -p 8081:8081 kochavalabs/mazzaroth start standalone
      const result = await runCmd('docker run -d -p 8081:8081 kochavalabs/mazzaroth start standalone')
      containerID = result.stdout
      console.log(`Container started: ${containerID}`)
    }
    let functionName = ''
    try {
      const configAction = {
        channelID: config.channel_id || defaultChannel,
        nonce: '0',
        blockExpirationNumber: '5',
        category: {
          type: 2,
          data: {
            type: 2,
            data: {
              owner: defaultOwner,
              admins: []
            }
          }
        }
      }

      await sleep(warmupMs)
      const owner = config['owner'] || defaultSender
      const client = new NodeClient(host, owner)
      const testSet = config['test-sets'][setName]
      await client.transactionForReceipt(configAction, null, deployMs)
      await client.transactionForReceipt(action, null, deployMs)
      testOutput += `Running test: ${setName} \n`
      for (const testIndex in testSet) {
        const test = testSet[testIndex]
        const sender = test['sender'] || defaultSender
        const client = new NodeClient(host, sender)
        const contractClient = new ContractClient(abi, client, xdrTypes, channel, null, transactionMs)
        functionName = test['function_name']
        const result = await contractClient[functionName](maxBlockExpirations, ...test['args'].map(x => {
          if (typeof x === 'object' && x !== null) {
            return JSON.stringify(x)
          }
          return x
        }))
        assert.deepStrictEqual(result, test['result'], `${setName} ${functionName} ${JSON.stringify(result)}`)
        testOutput += `   Pass: ${functionName} \n`
      }
    } catch (e) {
      testOutput += `   Fail: ${functionName} \n\n`
      console.log(testOutput)
      console.log(e)
      if (!skipDocker) {
        await runCmd(`docker kill ${containerID}`)
      }
      killed = true
    }
    if (!killed) {
      console.log(testOutput)
      if (!skipDocker) {
        await runCmd(`docker kill ${containerID}`)
      }
    }
  }
}

program.on('command:*', function (command) {
  program.help()
})

program.parse(process.argv)
