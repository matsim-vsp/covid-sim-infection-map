<template lang="pug">
.app
    .button-row
      p.flex1(style="margin: auto 0"): b {{ statusText }} {{ (filterStartDate+filterEndDate) ? `Day ${filterStartDate} - ${filterEndDate}` : '' }}
      button(@click="view=0" :class="{isActive: view==0}") Points
      button(@click="view=1" :class="{isActive: view==1}") Hexagons
      button(@click="view=2" :class="{isActive: view==2}") Districts

    .mymap.flex1(id="mymap")

    time-slider.time-slider(v-if="isLoaded"
      :numDays="numDays"
      :dailyTotals="dailyTotals"
      :weeks="weeks"
      :initial="[0, 30/numDays]"
      :labels="labels"
      @range="filterByDate"
    )

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox'
import { ScatterplotLayer } from '@deck.gl/layers'
// import { HexagonLayer } from '@deck.gl/aggregation-layers'
import { DataFilterExtension } from '@deck.gl/extensions'

import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Temporal } from 'temporal-polyfill'

import TimeSlider from '@/components/TimeSlider.vue'
import CSVStreamer from '@/CSVStreamer.worker.ts?worker'

const BATTERY_URL =
  'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/episim/battery'

// const DATA_URL = 'http://localhost:8000/infections-map'
// const INFECTIONS_URL = `${DATA_URL}/infections.csv` // 'calibration481.infectionEvents.txt`

interface Label {
  leftPct: number
  text: string
}

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
  home_lon: number
  home_lat: number
  daysSinceStart: number
}

enum MapView {
  points,
  hexagons,
  districts,
}

export default defineComponent({
  name: 'InfectionMap',
  components: { TimeSlider },
  data: () => {
    return {
      map: {} as any,
      allInfections: [] as InfectionRecord[],
      isLoaded: false,
      population: [] as any[],
      numInfections: 0,
      statusText: 'Loading...',
      coordinates: new Float64Array(1),
      view: MapView.points,
      deckOverlay: {} as any,
      startDate: '',
      numDays: 0,
      dailyTotals: new Float32Array(0),
      // largestNumDailyInfections: 0,
      filterStartDate: 0,
      filterEndDate: 0,
      weeks: [] as number[],
      labels: [] as Label[],
      csvStreamer: null as any,
    }
  },
  computed: {},
  watch: {
    view() {
      this.updateLayers()
    },
  },

  beforeDestroy() {
    if (this.csvStreamer) this.csvStreamer.terminate()

    this.allInfections = []
    this.coordinates = new Float64Array(1)
    this.population = []
  },

  mounted() {
    this.map = null
    this.map = new maplibregl.Map({
      container: 'mymap',
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      // style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [6.95, 50.9],
      zoom: 8,
      bearing: 0,
      pitch: 50,
    })

    this.loadInfections()
  },

  methods: {
    filterByDate(pct: { start: number; end: number }) {
      const start = Math.floor(this.numDays * pct.start)
      const end = Math.ceil(this.numDays * pct.end)
      this.filterStartDate = start
      this.filterEndDate = end

      this.updateLayers()
    },

    loadInfections() {
      // get URL from... URL bar
      let params = new URLSearchParams(document.location.search)
      let path = params.get('path') || ''

      // test data
      if (!path) {
        this.statusText = 'Need file path in URL'
        return
      }

      const batteryUrl = `${BATTERY_URL}/${path}`

      console.log({ batteryUrl })

      this.csvStreamer = new CSVStreamer()

      let total_lon = 0
      let total_lat = 0
      let numSampledPoints = 0

      this.csvStreamer.onmessage = async (buffer: MessageEvent) => {
        if (buffer.data.status) this.statusText = buffer.data.status
        if (buffer.data.error) this.statusText = buffer.data.error

        if (buffer.data.finished) {
          const lon_center = total_lon / numSampledPoints
          const lat_center = total_lat / numSampledPoints
          this.finishedLoadingInfections(lon_center, lat_center)
        }

        if (buffer.data.data) {
          const rows = buffer.data.data as any[]
          this.numInfections += rows.length
          this.statusText = 'Reading infections: ' + this.numInfections

          if (rows.length) {
            total_lon += rows[0][`"home_lon`]
            total_lat += rows[0][`"home_lat`]
            numSampledPoints += 1
          }

          for (const row of rows) {
            if (!this.startDate) this.startDate = row[`"date`]
            this.allInfections.push({
              home_lon: row[`"home_lon`],
              home_lat: row[`"home_lat`],
              daysSinceStart: row[`"daysSinceStart`],
            } as any)
          }
        }
      }

      this.csvStreamer.postMessage({
        url: batteryUrl,
        options: {
          // preview: 50000,
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        },
      })
    },

    finishedLoadingInfections(lon: number, lat: number) {
      this.csvStreamer.terminate()

      if (!this.allInfections.length) {
        this.statusText = 'ERROR: No infections file found'
        return
      }
      this.setupDailyTotals()
      this.isLoaded = true
      this.buildDeckLayer(lon, lat)
    },

    setupDailyTotals() {
      // this.startDate = this.allInfections[0].date
      this.numDays = this.allInfections[this.allInfections.length - 1].daysSinceStart || 0

      this.dailyTotals = new Float32Array(this.numDays + 1)

      this.allInfections.forEach(inf => {
        this.dailyTotals[inf.daysSinceStart] += 1
      })

      // this.largestNumDailyInfections = Math.max(...this.dailyTotals)
      // console.log(this.startDate, this.numDays, this.dailyTotals, this.largestNumDailyInfections)

      // weekly totals
      let total = 0
      for (let day = 0; day < this.dailyTotals.length; day++) {
        total += this.dailyTotals[day]
        if (day % 7 == 6) {
          this.weeks.push(total)
          total = 0
        }
      }
      if (total) this.weeks.push(total)
      // console.log(this.weeks)

      // start-of-year labels
      const firstDate = Temporal.PlainDate.from(this.startDate)
      const endDate = firstDate.add({ days: this.numDays })
      const startYear = firstDate.year
      const endYear = endDate.year
      // console.log({ startYear, endYear })

      this.labels.push({ leftPct: 0, text: firstDate.toString() })
      for (let i = startYear + 1; i <= endYear; i++) {
        const jan01 = Temporal.PlainDateTime.from(`${i}-01-01`)
        const daysSinceStart = jan01.since(firstDate).days
        const pct = (100 * daysSinceStart) / this.numDays
        this.labels.push({ leftPct: pct, text: `${i}` })
      }
      if (this.labels[this.labels.length - 1].leftPct > 96.5) {
        this.labels[this.labels.length - 1].leftPct = 96.5
      }
    },

    buildDeckLayer(lon: number, lat: number) {
      this.statusText = 'Generating map...'

      this.deckOverlay = new DeckOverlay({ layers: [] })

      this.map.addControl(this.deckOverlay)
      this.map.addControl(new maplibregl.NavigationControl())
      if (lon && lat) this.map.jumpTo({ center: [lon, lat], zoom: 11 })

      this.statusText = 'Home locations of infected people'

      this.updateLayers() // setTimeout(this.updateLayers, 1000)
    },

    updateLayers() {
      const layers = []

      layers.push(
        new ScatterplotLayer({
          visible: this.view == MapView.points,
          id: 'pointlayer-1',
          data: this.allInfections,
          getFillColor: [50, 0, 180],
          getRadius: 20,
          getPosition: (d: InfectionRecord) => [d.home_lon, d.home_lat],
          radiusScale: 1,
          stroked: false,
          filled: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255],
          opacity: 0.05,
          pickable: false,
          useDevicePixels: false,
          transitions: {},
          parameters: { depthTest: false },
          glOptions: { fp64: false },
          // updateTriggers: { }

          // filter infections by date
          extensions: [new DataFilterExtension({ filterSize: 1 })],
          filterRange: [this.filterStartDate, this.filterEndDate],
          getFilterValue: (d: InfectionRecord) => d.daysSinceStart,
        }) as any
      )

      // layers.push(
      //   new HexagonLayer({
      //     visible: this.view == MapView.hexagons,
      //     id: 'HexagonLayer',
      //     data: this.allInfections,
      //     extruded: true,
      //     getPosition: (d: any) => [d.home_lon, d.home_lat],
      //     getColorWeight: 1,
      //     getElevationWeight: 1,
      //     elevationScale: 2,
      //     radius: 200,
      //     pickable: true,
      //     opacity: 0.8,
      //     coverage: 0.85,
      //     useDevicePixels: false,

      //     // filter infections by date
      //     // extensions: [new DataFilterExtension({ filterSize: 1 })],
      //     // filterRange: [this.filterStartDate, this.filterEndDate],
      //     // getFilterValue: (d: InfectionRecord) => d.daysSinceStart,
      //   })
      // )

      this.deckOverlay._deck.setProps({ layers })
    },

    // new HeatmapLayer({
    //   id: 'heatmaplayer-1',
    //   // data: {
    //   //   length: this.coordinates.length / 2,
    //   //   attributes: {
    //   //     getPosition: { size: 2, value: this.coordinates },
    //   //   },
    //   // },
    //   data: this.allInfections,
    //   getPosition: (d: any) => [d.home_lon, d.home_lat],
    //   radiusPixels: 50,
    //   weightsTextureSize: 512,
    // }),
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
  display: grid;
  grid-template-rows: auto 1fr auto;
  grid-template-columns: 1fr;
}

.button-row {
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  display: flex;
  flex-direction: row;
  margin-bottom: 0.5rem;

  p {
    font-size: 1.1rem;
  }
}

.flex1 {
  flex: 1;
}

#mymap {
  flex: 1;
  width: 100%;
  grid-row: 2 / 4;
  grid-column: 1 / 2;
}

button {
  width: 4rem;
  text-align: center;
}

button.isActive {
  background-color: rgb(69, 126, 192);
  color: white;
  border-radius: 0;
}

.time-slider {
  grid-column: 1 / 2;
  grid-row: 3 / 4;
  z-index: 2;
  margin: 1rem 1rem 2.75rem 1rem;
}
</style>
