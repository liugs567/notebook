import { createApp } from 'vue'
import Antd from 'ant-design-vue'
import { config } from 'md-editor-v3'
import 'ant-design-vue/dist/reset.css'
import './style.css'
import App from './App.vue'
import router from './router'

// 关闭编辑器内长链接的缩短显示，避免输入区链接被省略
config({
  codeMirrorExtensions(extensions) {
    return extensions.filter((ext) => ext.type !== 'linkShortener')
  },
})

createApp(App).use(router).use(Antd).mount('#app')
