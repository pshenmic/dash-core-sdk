import { replaceInFile } from 'replace-in-file'

const coreJsPatchOptions = {
  files: './proto/generated/*',
  from: /"\.\/core"/g,
  to: '"./core.js"'
}

const protobufWrapperOptions = {
  files: './proto/generated/*',
  from: /"\.\/google\/protobuf\/wrappers"/g,
  to: '"./google/protobuf/wrappers.js"'
}
try {
  await replaceInFile(coreJsPatchOptions)
  await replaceInFile(protobufWrapperOptions)
} catch (error) {
  console.error('Error during patching:', error)
}
