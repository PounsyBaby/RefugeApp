import type { App, shell } from 'electron'
export function harden(app: App){
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      try{
        const u = new URL(url)
        if(u.protocol === 'https:' || u.protocol === 'mailto:'){
          // open externally in default browser
          // @ts-ignore
          shell.openExternal(url)
        }
      }catch{}
      return { action: 'deny' }
    })
    contents.on('will-navigate', (e) => e.preventDefault())
  })
}
