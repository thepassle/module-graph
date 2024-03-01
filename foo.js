import { init, guessJsSyntax } from 'fmu'

// initialize wasm (MUST call this before any other APIs)
await init()

const code = `exports.foo = 'bar'`
console.log(await guessJsSyntax(code)) // "CJS"
