const { validateMomentImage, chooseMomentImages } = require('@/utils/image')

describe('image upload validation', () => {
  beforeEach(() => {
    global.uni = undefined
  })

  it('允许 H5 blob 路径且 MIME 正确的动态图片', () => {
    expect(() => {
      validateMomentImage({
        path: 'blob:https://example.com/123',
        size: 1024,
        type: 'image/jpeg',
      })
    }).not.toThrow()
  })

  it('继续拦截 MIME 与路径都不合法的图片', () => {
    expect(() => {
      validateMomentImage({
        path: 'blob:https://example.com/123',
        size: 1024,
        type: 'application/pdf',
      })
    }).toThrow('动态图片仅支持 JPG/PNG/WebP 格式')
  })

  it('在 tempFiles 缺失时回退使用 tempFilePaths', async () => {
    global.uni = {
      chooseImage: jest.fn().mockImplementation(({ success }) => {
        success({
          tempFilePaths: ['/tmp/example.jpg'],
          tempFiles: [],
        })
      }),
      compressImage: jest.fn().mockImplementation(({ src, success }) => {
        success({ tempFilePath: src })
      }),
    }

    await expect(chooseMomentImages()).resolves.toEqual([
      { path: '/tmp/example.jpg' },
    ])
  })
})
