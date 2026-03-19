import typescript from '@rollup/plugin-typescript'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import polyfillNode from 'rollup-plugin-polyfill-node'

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
      resolve({ browser: true, preferBuiltins: false }),
      commonjs({ transformMixedEsModules: true }),
      polyfillNode(),
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
