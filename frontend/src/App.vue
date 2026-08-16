<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'
const quota = ref(Number(localStorage.getItem('quota') || 100))
const mode = ref<'new'|'mandatory'|'self'>('new')
const queue = ref<any[]>([])
const index = ref(0)
const loading = ref(false)
const revealed = ref(false)
const dashboard = ref({ dailyQuota: 100, newAvailable: 0, mandatoryDue: 0, selfDue: 0 })

const current = computed(() => queue.value[index.value])
const progress = computed(() => queue.value.length ? `${index.value + 1} / ${queue.value.length}` : '0 / 0')

async function api(path:string, options:RequestInit={}) {
  const res = await fetch(`${API}${path}`, { credentials:'include', ...options })
  if (!res.ok) throw new Error((await res.json().catch(()=>({error:'请求失败'}))).error)
  return res.json()
}
async function loadDashboard(){ dashboard.value = await api('/study/dashboard') }
async function loadQueue(){
  loading.value=true; revealed.value=false; index.value=0
  try { queue.value=(await api(`/study/queue/${mode.value}?limit=${mode.value==='new'?quota.value:10000}`)).items }
  finally { loading.value=false }
}
async function selectQuota(q:number){ quota.value=q; localStorage.setItem('quota',String(q)); if(mode.value==='new') await loadQueue() }
async function selectMode(m:'new'|'mandatory'|'self'){ mode.value=m; await loadQueue() }
async function rate(rating:number){
  if(!current.value) return
  await api('/study/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wordId:current.value.word.id,rating,reviewType:mode.value})})
  index.value++
  revealed.value=false
  if(index.value>=queue.value.length) await loadDashboard()
}
onMounted(async()=>{ await loadDashboard(); await loadQueue() })
</script>

<template>
  <div class="app">
    <header class="topbar"><div><div class="brand">考研英语</div><div class="sub">真题语境 · 智能复习</div></div><button class="ghost">我的</button></header>
    <main>
      <section v-if="mode==='new'" class="quota-card"><div><b>每日新词</b><span>今天背多少？</span></div><div class="quotas"><button v-for="q in [80,100,150,200]" :key="q" :class="{active:quota===q}" @click="selectQuota(q)">{{q}}</button></div></section>
      <nav class="modes"><button :class="{active:mode==='new'}" @click="selectMode('new')"><b>今日背诵</b><small>新词计划</small></button><button :class="{active:mode==='mandatory'}" @click="selectMode('mandatory')"><b>强制复习</b><small>昨日新词</small></button><button :class="{active:mode==='self'}" @click="selectMode('self')"><b>自主复习</b><small>算法到期</small></button></nav>
      <section class="stats"><div><strong>{{dashboard.newAvailable}}</strong><span>新词</span></div><div><strong>{{dashboard.mandatoryDue}}</strong><span>强制</span></div><div><strong>{{dashboard.selfDue}}</strong><span>自主</span></div></section>
      <section v-if="current" class="study-card">
        <div class="progress">{{progress}}</div><div class="word">{{current.word.word}}</div>
        <button v-if="!revealed" class="reveal" @click="revealed=true">显示释义</button>
        <div v-else class="detail"><div class="meaning">{{current.word.meaning}}</div><div v-if="current.word.example" class="example">{{current.word.example}}</div><div v-if="current.word.translation" class="translation">{{current.word.translation}}</div></div>
        <div v-if="revealed" class="ratings"><button @click="rate(1)"><b>不认识</b><small>重新学习</small></button><button @click="rate(2)"><b>模糊</b><small>缩短间隔</small></button><button @click="rate(3)"><b>认识</b><small>正常安排</small></button><button @click="rate(4)"><b>很熟</b><small>延长间隔</small></button></div>
      </section>
      <section v-else class="empty"><div class="check">✓</div><h2>{{loading?'加载中…':'这一组完成了'}}</h2><p v-if="!loading">{{mode==='new'?'今天的新词计划已经完成。':mode==='mandatory'?'昨日新词已经全部复习。':'目前没有到期复习。'}}</p></section>
    </main>
    <footer><span class="active">学习</span><span>词库</span><span>统计</span><span>我的</span></footer>
  </div>
</template>
