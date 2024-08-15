<template lang="pug">
.app
    p hello

</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'InfectionMap',
  components: {},
  data: () => {
    return {}
  },
  computed: {},
  methods: {},
  mounted() {},
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
