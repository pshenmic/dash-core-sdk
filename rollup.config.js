import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import pkg from './package.json' with {type: 'json'};
import typescript from '@rollup/plugin-typescript';
import babel from 'rollup-plugin-babel';

export default [
    // browser-friendly UMD build
    {
        input: 'index.ts',
        output: {
            name: 'howLongUntilLunch',
            file: 'dist/bundle.js',
            format: 'umd'
        },
        plugins: [
          typescript(),
            resolve({
              jsnext: true,
              main: true,
              browser: true,
            }), // so Rollup can find `ms`
           commonjs() ,// so Rollup can convert `ms` to an ES module,
          babel({
            exclude: 'node_modules/**',
          }),
        ]
    },
    //
    // // CommonJS (for Node) and ES module (for bundlers) build.
    // // (We could have three entries in the configuration array
    // // instead of two, but it's quicker to generate multiple
    // // builds from a single configuration where possible, using
    // // an array for the `output` option, where we can specify
    // // `file` and `format` for each target)
    // {
    //     input: 'index.ts',
    //     external: ['ms'],
    //     output: [
    //         { file: 'dist', format: 'cjs' },
    //         { file: 'dist', format: 'es' }
    //     ],
    //     plugins: [
    //       typescript()
    //     ]
    // }
];
