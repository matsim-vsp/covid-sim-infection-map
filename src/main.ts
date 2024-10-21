import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { Slider, Checkbox } from '@oruga-ui/oruga-next'
import Oruga from '@oruga-ui/oruga-next'
import '~/@oruga-ui/theme-oruga/dist/oruga.min.css'

createApp(App).use(Checkbox).use(Slider).mount('#app')
