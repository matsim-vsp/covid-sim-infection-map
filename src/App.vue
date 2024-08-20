<template lang="pug">
.app
    .flex-row
      p.flex1(style="margin: auto 0"): b {{ statusText }}
      button(@click="view=1" :class="{isActive: view==1}") Aggregate
      button(@click="view=0" :class="{isActive: view==0}") Home locations
    .mymap.flex1(id="mymap")

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import Papa from '@simwrapper/papaparse'
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox'
import { ScatterplotLayer } from '@deck.gl/layers'
import { HexagonLayer } from '@deck.gl/aggregation-layers'

import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const DATA_URL = 'http://localhost:8000/infections-map'
const INFECTIONS_URL = `${DATA_URL}/infections.csv` // 'calibration481.infectionEvents.txt`

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
}

enum MapView {
  points,
  hexagons,
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
      coordinates: new Float64Array(1),
      view: MapView.hexagons,
      deckOverlay: {} as any,
    }
  },
  computed: {},
  watch: {
    view() {
      this.updateLayers()
    },
  },

  beforeDestroy() {
    this.allInfections = []
    this.coordinates = new Float64Array(1)
    this.population = []
  },

  mounted() {
    this.map = new maplibregl.Map({
      container: 'mymap',
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      // style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [6.95, 50.9],
      zoom: 10,
      bearing: 0,
      pitch: 50,
    })

    this.loadInfections()
  },

  methods: {
    loadInfections() {
      Papa.parse(INFECTIONS_URL, {
        // preview: 250000,
        download: true,
        header: true,
        dynamicTyping: true,
        worker: true,
        skipEmptyLines: true,
        chunk: (results: any, _: any) => {
          this.numInfections += results.data.length
          this.statusText = 'Reading infections: ' + this.numInfections
          for (const row of results.data) {
            this.allInfections.push({
              date: row[`"date`],
              home_lon: row[`"home_lon`],
              home_lat: row[`"home_lat`],
            } as any)
          }
        },
        complete: () => {
          this.buildDeckLayer()
        },
      })
    },

    buildDeckLayer() {
      this.statusText = 'Generating map...'

      this.deckOverlay = new DeckOverlay({ layers: [] })

      this.map.addControl(this.deckOverlay)
      this.map.addControl(new maplibregl.NavigationControl())
      console.log('done done')
      this.statusText = 'Infections Map'

      this.updateLayers() // setTimeout(this.updateLayers, 1000)
    },

    updateLayers() {
      const layers = []

      layers.push(
        new ScatterplotLayer({
          visible: this.view == MapView.points,
          id: 'pointlayer-1',
          data: this.allInfections,
          getFillColor: [200, 0, 150],
          getRadius: 10,
          getPosition: (d: InfectionRecord) => [d.home_lon, d.home_lat],
          radiusScale: 1,
          stroked: false,
          filled: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255],
          opacity: 0.1,
          pickable: false,
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
        }) as any
      )

      layers.push(
        new HexagonLayer({
          visible: this.view == MapView.hexagons,
          id: 'HexagonLayer',
          data: this.allInfections,
          extruded: true,
          getPosition: (d: any) => [d.home_lon, d.home_lat],
          getColorWeight: 1,
          getElevationWeight: 1,
          elevationScale: 2,
          radius: 200,
          pickable: true,
          opacity: 0.8,
          coverage: 0.85,
        })
      )

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
  display: flex;
  flex-direction: column;
}

.flex-row {
  display: flex;
  flex-direction: row;
  margin-bottom: 0.5rem;
  gap: 0.5rem;
}

.flex1 {
  flex: 1;
}

#mymap {
  flex: 1;
  width: 100%;
}

button.isActive {
  background-color: #47f;
  color: white;
}
</style>
