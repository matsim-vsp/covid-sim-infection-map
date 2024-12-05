<template lang="pug">
.app
    .button-row
      p.flex1(style="margin: auto 0; line-height: 1.4rem")
        b {{ statusText }}{{ (filterStartDate+filterEndDate) ? `: Day ${filterStartDate} - ${filterEndDate}` : '' }}
        p(style="font-size: 0.85rem") {{ path }}
      //- button(@click="view=0" :class="{isActive: view==0}") Points
      //- button(@click="view=1" :class="{isActive: view==1}") Hexagons
      //- button(@click="view=2" :class="{isActive: view==2}") Districts

    .mymap.flex1(id="mymap")

    time-slider.time-slider(v-if="isLoaded"
      :numDays="numDays"
      :dailyTotals="dailyTotals"
      :weeks="weeks"
      :initial="[0, 30/numDays]"
      :labels="labels"
      @range="filterByDate"
    )

    .flex-row(style="font-size: 0.8rem; margin: 0.75rem 0 0 auto; gap: 1rem; color: white;")
      p: b Radius: {{ radiusSlider}}
      o-slider(v-if="!updating" v-model="radiusSlider" variant="warning" :tooltip="false" :min="range[0]" :max="range[1]" style="width: 10rem; margin: 0.5rem 0; padding: 0 0.5rem" )
      o-checkbox.max-content(v-model="useMeters" variant="warning") meters

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox'
import { ScatterplotLayer } from '@deck.gl/layers'
// import { HexagonLayer } from '@deck.gl/aggregation-layers'
import { DataFilterExtension } from '@deck.gl/extensions'

import YAML from 'yaml'
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
  infection_type: string
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
      useMeters: true,
      radiusSlider: 250,
      range: [20, 1000],
      path: '',
      updating: true,
    }
  },
  computed: {},
  watch: {
    view() {
      this.updateLayers()
    },
    radiusSlider() {
      this.updateLayers()
    },
    async useMeters() {
      await this.setupUnits()
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
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', // 'mapbox://styles/mapbox/light-v10', //
      // style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [8, 49.9],
      zoom: 7,
      bearing: 0,
      pitch: 50,
    })

    this.loadInfections()
  },

  methods: {
    async setupUnits() {
      this.updating = true
      this.range = this.useMeters ? [10, 1000] : [1, 30]
      await this.$nextTick()
      this.updating = false
      if (!this.useMeters && this.radiusSlider > 30) this.radiusSlider = 30
      await this.$nextTick()
    },

    filterByDate(pct: { start: number; end: number }) {
      const start = Math.floor(this.numDays * pct.start)
      const end = Math.ceil(this.numDays * pct.end)
      this.filterStartDate = start
      this.filterEndDate = end

      this.updateLayers()
    },

    async loadInfections() {
      // get URL from... URL bar
      let params = new URLSearchParams(document.location.search)
      this.path = params.get('path') || ''

      if (!this.path) {
        // path = 'jakob/2024-08-28/2-updateReporting-noAgg/summaries/calibration21.infections.csv.gz'
        this.statusText = 'Need file path in URL'
        return
      }

      // radius settings
      const units = params.get('units')
      if ('pixels' == units) this.useMeters = false

      this.range = this.useMeters ? [20, 1000] : [1, 30]
      const initialRadius = parseInt(params.get('radius') || '250')
      this.radiusSlider = initialRadius
      this.updating = false
      await this.$nextTick()

      const batteryUrl = `${BATTERY_URL}/${this.path}`
      console.log({ batteryUrl })

      // Start Date - grab metadata.yaml from parent path
      const summaries = batteryUrl.lastIndexOf('summaries/')
      const metadataUrl = batteryUrl.substring(0, summaries) + 'metadata.yaml'
      const raw = await (await fetch(metadataUrl)).text()
      const metadata = YAML.parse(raw)
      this.startDate = metadata.startDates ? metadata.startDates[0] : '2020-02-25'
      console.log(this.startDate)

      // Stream CSV data
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
            total_lon += rows[0]['home_lon']
            total_lat += rows[0]['home_lat']
            numSampledPoints += 1
          }

          for (const row of rows) {            
            this.allInfections.push({
              home_lon: row['home_lon'],
              home_lat: row['home_lat'],
              daysSinceStart: row['daysSinceStart'],
              infection_type: row['infection_type']
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

      // console.log('GOT YOU', this.allInfections)

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

      this.filterEndDate = this.numDays

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

      this.deckOverlay = new DeckOverlay({ interleaved: true, layers: [] })

      this.map.addControl(this.deckOverlay)
      this.map.addControl(new maplibregl.NavigationControl())
      if (lon && lat) this.map.jumpTo({ center: [lon, lat], zoom: 9 })

      this.statusText = 'Home locations of infected people'

      // setTimeout(this.updateLayers, 1000)
      this.updateLayers()
    },

    getColor(value: String) {
      if (value === "import") {
        return [50, 0, 180]
      } else if (value === "normal") {
        return [0, 204, 0]
      } else {
        return [255, 0, 0]
      }
    },

    updateLayers() {
      if (!this.deckOverlay?._deck) return

      // save settings in url bar
      const urlParams = new URLSearchParams(window.location.search)
      urlParams.set('radius', '' + this.radiusSlider)
      urlParams.set('units', this.useMeters ? 'meters' : 'pixels')
      history.replaceState({}, '', '?' + urlParams.toString())

      const layers = []

      layers.push(
        new ScatterplotLayer({
          visible: this.view == MapView.points,
          id: 'pointlayer-1',
          data: this.allInfections,
          getFillColor: (d: InfectionRecord) => this.getColor(d.infection_type),
          getRadius: 1,
          getPosition: (d: InfectionRecord) => [d.home_lon, d.home_lat],
          radiusScale: this.radiusSlider,
          radiusUnits: this.useMeters ? 'meters' : 'pixels',
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
  background-color: rgb(49, 99, 134);
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  grid-template-columns: 1fr;
}

.button-row {
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  display: flex;
  flex-direction: row;
  margin-bottom: 0.5rem;
  color: white;

  p {
    font-size: 1.1rem;
  }
}

.flex-row {
  display: flex;
  flex-direction: row;
}

.flex-col {
  display: flex;
  flex-direction: column;
}

.flex1 {
  flex: 1;
}

.max-content {
  width: max-content;
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
