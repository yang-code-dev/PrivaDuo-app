const { spawnSync } = require('child_process')

const mode = process.argv[2] || 'web'
const cliPath = process.env.HBUILDERX_CLI
const webTitle = process.env.PAIRSPACE_WEB_TITLE || 'PrivaDuo'

if (!cliPath) {
  console.error('[publish-h5] 请先设置环境变量 HBUILDERX_CLI，例如：')
  console.error('HBUILDERX_CLI=/Applications/HBuilderX.app/Contents/MacOS/cli npm run publish:h5:web')
  process.exit(1)
}

const args = ['publish', 'web', '--project', process.cwd(), '--webTitle', webTitle]

if (mode === 'hosting') {
  const provider = process.env.PAIRSPACE_UNICLOUD_PROVIDER || 'aliyun'
  const spaceId = process.env.PAIRSPACE_UNICLOUD_SPACE_ID

  if (!spaceId) {
    console.error('[publish-h5] hosting 模式需要设置 PAIRSPACE_UNICLOUD_SPACE_ID')
    process.exit(1)
  }

  args.push('--webHosting', 'true', '--provider', provider, '--spaceId', spaceId)
}

const result = spawnSync(cliPath, args, { stdio: 'inherit' })
process.exit(result.status || 0)
