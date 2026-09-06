import globals from 'globals';
export default [{
  files:['src/static/*.js','scripts/*.mjs','tests/frontend/*.js'],
  ignores:['src/static/pdf*','src/static/kokoro*'],
  languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.browser,...globals.node}},
  rules:{'no-undef':'error','no-unused-vars':['error',{args:'none',caughtErrors:'none'}],'no-unreachable':'error','no-constant-condition':'error','no-dupe-keys':'error','no-duplicate-case':'error','valid-typeof':'error','constructor-super':'error','no-unsafe-finally':'error'}
}];
