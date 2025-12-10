import typescript from '@rollup/plugin-typescript'

export default [
  // browser-friendly UMD build
  {
    input: 'index.ts',
    output: {
      name: 'DashCoreSDK',
      file: 'dist/bundle.min.js',
      format: 'umd'
    },
    plugins: [
      typescript({
        include: [
          './proto/generated/**/*',
          './index.ts',
          './src/**/*'
        ]
      })
    ]
  }
]
