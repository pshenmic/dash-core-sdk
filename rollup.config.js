import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

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
        file: 'dist/bundle.es6.js',
        format: 'es'
      },
      {
        name: 'DashCoreSDK',
        file: 'dist/bundle.umd.js',
        format: 'umd'
      }
    ],
    plugins
  }
]
