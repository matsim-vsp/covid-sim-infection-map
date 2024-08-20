<template lang="pug">
.time-slider(
  @mousemove.stop="dividerDragging"
  @mouseup="dividerDragEnd"
)

  #dailybar
    //- .week(v-for="week in weeks")
    .week(v-for="week in weeks" :style="{height: `${getWeekHeight(week)}%`}")

  #dragthumb(:style="{left: `${thumbLeft}px`}"
      @mousedown="dividerDragStart"
      @mouseup="dividerDragEnd"
      @mousemove.stop="dividerDragging"
  )

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

export default defineComponent({
  name: 'TimeSlider',
  components: {},

  props: {
    numDays: Number,
    dailyTotals: { type: Object as PropType<Float32Array>, required: true },
    weeks: { type: Object as PropType<number[]>, required: true },
  },

  data: () => {
    return {
      leftside: 0,
      rightside: 0,
      isDraggingDivider: 0,
      isDragHappening: false,
      dragStartWidth: 100,
      thumbLeft: 100,
      thumbWidth: 100,
      pctStart: 0,
      pctEnd: 1,
      maxInfections: 1,
    }
  },
  computed: {},
  watch: {},

  mounted() {
    this.rightside = this.numDays || 0
    this.updateWeeks()
  },

  methods: {
    updateWeeks() {
      this.maxInfections = Math.max(...this.weeks)
    },

    getWeekHeight(numInfections: number) {
      const height = Math.floor((100 * numInfections) / this.maxInfections)
      console.log(numInfections, this.maxInfections, height)
      return height
    },

    dividerDragStart(e: MouseEvent) {
      console.log('dragStart', e)
      this.isDraggingDivider = e.clientX
      this.dragStartWidth = this.thumbLeft
    },

    dividerDragEnd(_: MouseEvent) {
      this.isDraggingDivider = 0
    },

    dividerDragging(e: MouseEvent) {
      if (!this.isDraggingDivider) return

      const dailybar = document.getElementById('dailybar') as HTMLElement
      const totalWidth = dailybar.clientWidth

      const deltaX = e.clientX - this.isDraggingDivider
      this.thumbLeft = Math.max(0, this.dragStartWidth + deltaX)
      this.thumbLeft = Math.min(this.thumbLeft, totalWidth - this.thumbWidth)

      // calculate extent of thumbscroll
      this.pctStart = this.thumbLeft / totalWidth
      this.pctEnd = (this.thumbLeft + this.thumbWidth) / totalWidth

      this.$emit('range', { start: this.pctStart, end: this.pctEnd })
    },

    filterByDate() {},
  },
})
</script>

<style scoped lang="scss">
.time-slider {
  position: relative;
  background-color: white;
  height: 4rem;
  display: flex;
  flex-direction: row;
  border: 2px solid #4972e2;
  opacity: 0.9;
}

#dailybar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  // background-color: lightgray;
  display: flex;
  flex-direction: row;
  z-index: 3;
  padding: 4px 4px;
}

.week {
  flex: 1;
  // height: 20px;
  background-color: #e24986;
  margin-top: auto;
  margin-right: 1px;
  margin-top: auto;
  padding-bottom: 1px;
}

#dragthumb {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 100px;
  background-color: #8ad2f9;
  z-index: 5;
  color: black;
  opacity: 0.5;
}

#dragthumb:active {
  background-color: #0cf;
  cursor: grab;
}
</style>
