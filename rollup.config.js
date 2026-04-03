import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import commonjs from '@rollup/plugin-commonjs'

const plugins = [
  nodeResolve({
    browser: true,
    preferBuiltins: false
  }),
  commonjs(),
  typescript({
    include: [
      './proto/generated/**/*',
      './index.ts',
      './src/**/*'
    ]
  })
]

export default [
  {
    input: 'index.ts',
    output: [
      {
        file: 'dist/browser.js',
        format: 'es'
      },
      {
        name: 'DashCoreSDK',
        file: 'dist/bundle.min.js',
        format: 'umd'
      }
    ],
    plugins
  }
]
