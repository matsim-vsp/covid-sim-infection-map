<template lang="pug">
.time-slider(
  @mousemove.stop="dividerDragging"
  @mouseup="dividerDragEnd"
)

  #dailybar
    //- .week(v-for="week in weeks")
    .week(v-for="week in weeks" :style="{height: `${getWeekHeight(week)}%`}")

  #dragthumb(:style="{left: `${thumbLeft}px`, width: `${thumbWidth}px`}"
    @mousedown="dividerDragStart"
    @mouseup="dividerDragEnd"
    @mousemove.stop="dividerDragging"
  )

    #dragleftie(
      @mousedown.stop="dividerDragStart($event,'left')"
      @mouseup.stop="dividerDragEnd($event,'left')"
      @mousemove.stop="dividerDragging($event,'left')"
    )
    #dragrightie(
      @mousedown.stop="dividerDragStart($event,'right')"
      @mouseup.stop="dividerDragEnd($event,'right')"
      @mousemove.stop="dividerDragging($event,'right')"
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
      side: '',
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
      return height
    },

    dividerDragStart(e: MouseEvent, side: string) {
      this.isDraggingDivider = e.clientX
      this.dragStartWidth = this.thumbLeft
      this.side = side
    },

    dividerDragEnd(_: MouseEvent) {
      this.isDraggingDivider = 0
      this.side = ''
    },

    dividerDragging(e: MouseEvent) {
      if (!this.isDraggingDivider) return

      if (this.side == 'left') return this.adjustLeftSide(e)
      if (this.side == 'right') return this.adjustRightSide(e)

      const dailybar = document.getElementById('dailybar') as HTMLElement
      const totalWidth = dailybar.clientWidth

      const deltaX = e.clientX - this.isDraggingDivider
      this.thumbLeft = Math.max(0, this.dragStartWidth + deltaX)
      this.thumbLeft = Math.min(this.thumbLeft, totalWidth - this.thumbWidth)

      // calculate extent of thumbscroll
      this.pctStart = this.thumbLeft / totalWidth
      this.pctEnd = (this.thumbLeft + this.thumbWidth) / totalWidth

      console.log(this.pctStart, this.pctEnd)
      this.$emit('range', { start: this.pctStart, end: this.pctEnd })
    },

    adjustLeftSide(e: MouseEvent) {
      const dailybar = document.getElementById('dailybar') as HTMLElement
      const totalWidth = dailybar.clientWidth

      const deltaX = e.clientX - this.isDraggingDivider // this.dragStartWidth - e.clientX

      const testLeft = this.thumbLeft + deltaX
      if (testLeft < 0) return
      if (testLeft >= this.thumbLeft + this.thumbWidth - 20) return

      this.isDraggingDivider += deltaX
      this.thumbLeft += deltaX
      this.thumbWidth -= deltaX

      this.thumbLeft = Math.max(0, this.thumbLeft)

      // calculate extent of thumbscroll
      this.pctStart = this.thumbLeft / totalWidth
      this.pctEnd = (this.thumbLeft + this.thumbWidth) / totalWidth

      console.log(this.pctStart, this.pctEnd)
      this.$emit('range', { start: this.pctStart, end: this.pctEnd })
    },

    adjustRightSide(e: MouseEvent) {
      const dailybar = document.getElementById('dailybar') as HTMLElement
      const totalWidth = dailybar.clientWidth

      const deltaX = e.clientX - this.isDraggingDivider // this.dragStartWidth - e.clientX

      const testWidth = this.thumbWidth + deltaX
      if (testWidth < 20) return
      if (this.thumbLeft + testWidth > totalWidth) return

      this.thumbWidth += deltaX
      this.isDraggingDivider = e.clientX

      // calculate extent of thumbscroll
      this.pctStart = this.thumbLeft / totalWidth
      this.pctEnd = (this.thumbLeft + this.thumbWidth) / totalWidth

      console.log(this.pctStart, this.pctEnd)
      this.$emit('range', { start: this.pctStart, end: this.pctEnd })
    },

    sizerDragStart(e: MouseEvent) {
      console.log('dragStart', e)
      this.isDraggingDivider = e.clientX
      this.dragStartWidth = this.thumbLeft
    },

    sizerDragEnd(_: MouseEvent) {
      this.isDraggingDivider = 0
    },

    sizerDragging(e: MouseEvent) {
      if (!this.isDraggingDivider) return

      console.log('sizer', this.isDraggingDivider, e.clientX, this.thumbLeft, this.thumbWidth)

      const dailybar = document.getElementById('dailybar') as HTMLElement
      const totalWidth = dailybar.clientWidth

      const deltaX = e.clientX - this.isDraggingDivider
      console.log({ deltaX })
      let diff = deltaX
      // Math.max(0, this.dragStartWidth + deltaX)
      // diff = Math.min(this.thumbLeft, totalWidth - this.thumbWidth)
      console.log(diff)

      console.log('oldwidth', this.thumbWidth, 'newwidth', this.thumbWidth - diff)
      console.log('oldleft', this.thumbLeft, 'newleft', this.thumbLeft + diff)
      this.thumbWidth -= diff
      this.thumbLeft += diff

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
  height: 3rem;
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
  background-color: #8ad2f9;
  z-index: 5;
  color: black;
  opacity: 0.6;
  display: flex;
  flex-direction: row;
  border-radius: 8px;
}

#dragthumb:active,
#dragthumb:hover {
  background-color: #0cf;
  cursor: grab;
  transition: background-color 0.2s, border-color 0.2s;
  opacity: 0.7;
}

#dragleftie,
#dragrightie {
  margin: 0 auto 0 0;
  width: 8px;
  background-color: #218f3a;
  opacity: 0;
  z-index: 10;
}

#dragthumb:hover #dragleftie,
#dragthumb:hover #dragrightie {
  transition: opacity 0.2s;
  opacity: 1;
  cursor: ew-resize;
}

#dragleftie {
  border-top-left-radius: 8px;
  border-bottom-left-radius: 8px;
}

#dragrightie {
  margin: 0 0 0 auto;
  border-top-right-radius: 8px;
  border-bottom-right-radius: 8px;
}
</style>
