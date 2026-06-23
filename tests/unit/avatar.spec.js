jest.mock('@/utils/cloud', () => ({
  isCloudReady: jest.fn(),
}))

const { isCloudReady } = require('@/utils/cloud')
const { persistAvatar } = require('@/services/avatar')
const { validateAvatarMeta } = require('@/utils/validators')

class MockFileReader {
  readAsDataURL(blob) {
    this.result = `data:${blob.type || 'image/jpeg'};base64,mock-avatar`
    if (typeof this.onload === 'function') {
      this.onload()
    }
  }
}

describe('persistAvatar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    isCloudReady.mockReturnValue(false)
    global.window = undefined
    global.fetch = undefined
    global.FileReader = undefined
    global.uni = undefined
    global.uniCloud = {
      uploadFile: jest.fn(),
      getTempFileURL: jest.fn(),
    }
  })

  it('直接返回已持久化的远程头像地址', async () => {
    const avatar = 'https://cdn.example.com/avatar.jpg'

    await expect(persistAvatar(avatar)).resolves.toBe(avatar)
  })

  it('在本地 mock 模式下支持 blob 临时头像路径', async () => {
    global.window = {}
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: async () => ({ type: 'image/jpeg' }),
    })
    global.FileReader = MockFileReader

    await expect(persistAvatar('blob:avatar-temp')).resolves.toBe('data:image/jpeg;base64,mock-avatar')
    expect(global.fetch).toHaveBeenCalledWith('blob:avatar-temp')
  })

  it('拦截不支持的头像格式', async () => {
    await expect(persistAvatar('/tmp/avatar.gif')).rejects.toThrow('头像仅支持 jpg/png 格式')
  })

  it('在云上传返回空 fileID 时抛出错误', async () => {
    isCloudReady.mockReturnValue(true)
    global.uniCloud.uploadFile.mockResolvedValue({})

    await expect(persistAvatar('wxfile://avatar-temp')).rejects.toThrow('头像上传失败，请重试')
    expect(global.uniCloud.getTempFileURL).not.toHaveBeenCalled()
  })

  it('在云端临时地址获取失败时抛出错误', async () => {
    isCloudReady.mockReturnValue(true)
    global.uniCloud.uploadFile.mockResolvedValue({
      fileID: 'cloud://space/avatar-file',
    })
    global.uniCloud.getTempFileURL.mockResolvedValue({
      fileList: [{}],
    })

    await expect(persistAvatar('wxfile://avatar-temp')).rejects.toThrow('头像地址获取失败，请重试')
  })

  it('在云上传直接返回 http 地址时直接透传', async () => {
    isCloudReady.mockReturnValue(true)
    global.uniCloud.uploadFile.mockResolvedValue({
      fileID: 'https://cdn.example.com/avatar.jpg',
    })

    await expect(persistAvatar('wxfile://avatar-temp')).resolves.toBe('https://cdn.example.com/avatar.jpg')
    expect(global.uniCloud.getTempFileURL).not.toHaveBeenCalled()
  })
})

describe('validateAvatarMeta', () => {
  it('允许 H5 blob 头像路径与合法 MIME', () => {
    expect(validateAvatarMeta({
      path: 'blob:https://example.com/avatar-temp',
      size: 1024,
      type: 'image/jpeg',
    })).toEqual({ valid: true, message: '' })
  })

  it('继续拦截 blob 路径但 MIME 不合法的头像', () => {
    expect(validateAvatarMeta({
      path: 'blob:https://example.com/avatar-temp',
      size: 1024,
      type: 'application/pdf',
    })).toEqual({ valid: false, message: '头像仅支持 jpg/png 格式' })
  })
})
