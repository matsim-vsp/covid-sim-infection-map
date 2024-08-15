<template lang="pug">
.app
    p {{ statusText}}
    .mymap(id="mymap")

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import Papa from '@simwrapper/papaparse'
// import { Deck } from '@deck.gl/core'
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox'
import { ScatterplotLayer } from '@deck.gl/layers'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import Coords from './Coords'

const DATA_URL = 'http://localhost:8000/infections-map'
const INFECTIONS_URL = `${DATA_URL}/calibration481.infectionEvents.txt`
const POPULATION_URL = `${DATA_URL}/population.csv`
const PROJECTION = 'EPSG:25832'

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
  coords: number[]
}

export default defineComponent({
  name: 'InfectionMap',
  components: {},
  data: () => {
    return {
      map: {} as any,
      allInfections: [] as InfectionRecord[],
      isLoaded: false,
      population: [] as any[],
      numInfections: 0,
      statusText: 'Loading...',
    }
  },
  computed: {},
  watch: {},

  mounted() {
    this.map = new maplibregl.Map({
      container: 'mymap',
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [5, 50],
      zoom: 5,
      bearing: 0,
      pitch: 0,
    })

    this.loadPopulation()
  },

  methods: {
    loadPopulation() {
      Papa.parse(POPULATION_URL, {
        // preview: 10000,
        download: true,
        header: true,
        dynamicTyping: false,
        delimiter: ',',
        skipEmptyLines: true,
        complete: (results: any, _: any) => {
          this.population = results.data
          this.loadInfections()
        },
      })
    },

    loadInfections() {
      Papa.parse(INFECTIONS_URL, {
        preview: 200000,
        download: true,
        header: true,
        dynamicTyping: false,
        worker: true,
        delimiter: '\t',
        skipEmptyLines: true,
        chunk: (results: any, _: any) => {
          console.log('CHUNKK', results.data)
          this.numInfections += results.data.length
          this.statusText = 'Reading infections: ' + this.numInfections
          for (const row of results.data) {
            const { date, infected } = row
            this.allInfections.push({ date, infected } as any)
          }
        },
        complete: (results: any, file: any) => {
          console.log('COMPLETE', { results, file })
          this.finishedLoadingInfections()
        },
      })
    },

    async finishedLoadingInfections() {
      console.log('DONE', { population: this.population, infections: this.allInfections })

      // prepare population data
      this.statusText = 'Building population lookup'
      await this.$nextTick()

      const personLookup = {} as any

      for (const person of this.population) {
        const xy = [parseFloat(person.homeX), parseFloat(person.homeY)]
        const [lon, lat] = Coords.toLngLat(PROJECTION, xy)
        personLookup[`${person.id}`] = Object.assign({ lat, lon }, person)
      }

      // prepare infection data
      this.statusText = 'Joining infection data'
      await this.$nextTick()

      for (const infection of this.allInfections) {
        const person = personLookup[infection.infected]
        infection.coords = [person.lon, person.lat]
      }

      console.log('REALLY DONE', this.allInfections)
      this.statusText = ''
      this.buildDeckLayer()
    },

    buildDeckLayer() {
      const deckOverlay = new DeckOverlay({
        layers: [
          new ScatterplotLayer({
            id: 'pointlayer-1',
            data: this.allInfections,
            getFillColor: [64, 0, 200],
            getRadius: 25,
            getPosition: (d: InfectionRecord) => d.coords as any,
            radiusScale: 1,
            stroked: false,
            filled: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255],
            opacity: 1.0,
            pickable: true,
            useDevicePixels: true,
            transitions: {},
            parameters: { depthTest: false },
            glOptions: { fp64: false },
            // updateTriggers: {}
            // },
            // filter shapes
            // extensions: [new DataFilterExtension({ filterSize: 1 })],
            // filterRange: [0, 1], // set filter to -1 to filter element out
            // getFilterValue: (_: any, o: DeckObject) => {
            //   return featureFilter[o.index]
            // },
          }) as any,
        ],
      })

      this.map.addControl(deckOverlay)
      this.map.addControl(new maplibregl.NavigationControl())
    },
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
}

#mymap {
  flex: 1;
  width: 100%;
}
</style>
