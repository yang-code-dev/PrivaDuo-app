const cloudConfig = {
  provider: 'aliyun',
  // Required: replace with your own uniCloud spaceId, for example `mp-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.
  spaceId: '',
  // Required: replace with your own uniCloud clientSecret. Never commit the real value to a public repository.
  clientSecret: '',
  // Optional: usually keep the default endpoint unless your provider requires a custom endpoint.
  endpoint: 'https://api.next.bspapp.com',
  // Optional: your own hosted H5 origin, for example `https://your-app.example.com`.
  hostingOrigin: '',
  // Required for your own deployment only. Must match the uniCloud env var `PAIRSPACE_PUBLIC_SIGN_SECRET`.
  publicSignSecret: '',
  // Optional frontend local cache encryption seed. Leave empty to auto-generate a per-device random secret.
  localCryptoSecret: '',
}

export default cloudConfig
