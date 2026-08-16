<script setup lang="ts">
import { ref } from 'vue'

const quota = ref(100)
const mode = ref<'new' | 'mandatory' | 'self'>('new')
const word = ref({ word: 'barrier', meaning: '障碍；屏障', example: 'Cost remains a major barrier to entry.' })
const progress = ref(0)

function chooseQuota(value: number) { quota.value = value }
function chooseMode(value: 'new' | 'mandatory' | 'self') { mode.value = value }
function answer() { progress.value = Math.min(quota.value, progress.value + 1) }
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div><div class="brand">考研英语</div><div class="sub">真题语境 · 智能复习</div></div>
      <button class="avatar">我</button>
    </header>

    <main>
      <section class="hero">
        <div><p class="eyebrow">今日学习</p><h1>{{ progress }} <span>/ {{ quota }}</span></h1><div class="progress"><i :style="{ width: `${Math.round(progress / quota * 100)}%` }"></i></div></div>
      </section>

      <section class="quota card">
        <div class="section-title"><strong>每日新词</strong><span>今天学习多少？</span></div>
        <div class="quota-grid"><button v-for="item in [80,100,150,200]" :key="item" :class="{active: quota === item}" @click="chooseQuota(item)">{{ item }}</button></div>
      </section>

      <section class="modes">
        <button :class="['mode-card', {active: mode === 'new'}]" @click="chooseMode('new')"><b>今日背诵</b><span>{{ Math.max(quota - progress, 0) }} 个新词</span></button>
        <button :class="['mode-card', {active: mode === 'mandatory'}]" @click="chooseMode('mandatory')"><b>强制复习</b><span>昨天学习的词</span></button>
        <button :class="['mode-card', {active: mode === 'self'}]" @click="chooseMode('self')"><b>自主复习</b><span>算法推荐到期</span></button>
      </section>

      <section class="study card">
        <div class="study-meta">{{ mode === 'new' ? '今日背诵' : mode === 'mandatory' ? '强制复习' : '自主复习' }}</div>
        <h2>{{ word.word }}</h2>
        <p class="meaning">{{ word.meaning }}</p>
        <p class="example">{{ word.example }}</p>
        <button class="show-more">查看真题语境</button>
        <div class="answers">
          <button @click="answer">不认识</button><button @click="answer">模糊</button><button class="primary" @click="answer">认识</button><button @click="answer">很熟</button>
        </div>
      </section>
    </main>

    <nav class="bottom-nav"><button class="active">学习</button><button>词库</button><button>统计</button><button>我的</button></nav>
  </div>
</template>
