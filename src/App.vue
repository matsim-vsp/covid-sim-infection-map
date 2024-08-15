<template lang="pug">
.app
    p hello

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import Papa from '@simwrapper/papaparse'

const DATA_URL = 'http://localhost:8000/infections-map'

interface InfectionRecord {
  date: string
  infected: string
  time?: number
  infector?: string
  infectionType?: string
  groupSize?: number
  facility?: string
  virusStrain?: string
  probability?: number
}

export default defineComponent({
  name: 'InfectionMap',
  components: {},
  data: () => {
    return {
      allInfections: [] as InfectionRecord[],
      isLoaded: false,
    }
  },
  computed: {},
  watch: {},
  methods: {
    finishedLoadingInfections() {
      console.log('DONE', this.allInfections)
    },
  },
  mounted() {
    const infections = `${DATA_URL}/calibration481.infectionEvents.txt`

    Papa.parse(infections, {
      // preview: 10000,
      download: true,
      header: true,
      dynamicTyping: true,
      worker: false,
      delimiter: '\t',
      skipEmptyLines: true,
      chunk: (results: any, _: any) => {
        console.log('CHUNKK', results.data)
        for (const row of results.data) {
          const { date, infected } = row
          this.allInfections.push({ date, infected })
        }
      },
      complete: (results: any, file: any) => {
        console.log('COMPLETE', { results, file })
        this.finishedLoadingInfections()
      },
    })
  },
})
</script>

<style scoped lang="scss">
@import '~/the-new-css-reset/css/reset.css';

html {
  box-sizing: border-box;
}

*,
*::before,
*::after {
  box-sizing: inherit;
}

body,
html {
  // font-family: $mainFont;
  height: 100%;
  overscroll-behavior: contain;
}

html {
  overflow-y: auto;
  color: var(--text);
}

b {
  font-weight: bold;
}

.app {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  margin: 0.5rem 0.5rem;
  padding: 0.5rem 0.5rem;
  background-color: rgb(228, 228, 182);
  display: flex;
  flex-direction: column;
  border-radius: 10px;
}
</style>
