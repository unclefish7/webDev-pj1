<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { request } from './api';
import Dashboard from './components/Dashboard.vue';
import Manager from './components/Manager.vue';
import Logs from './components/Logs.vue';
import './style.css';

const sections = [{id: 'overview', name: '风险概览', icon: '◈'}, {id: 'vulnerabilities', name: 'CVE 漏洞管理', icon: '◇'}, {id: 'components', name: 'Maven 组件管理', icon: '▦'}, {id: 'logs', name: '操作日志', icon: '≡'}];
const parseHash = () => { const params = new URLSearchParams(location.hash.slice(1)); const id = params.get('page') || 'overview'; return { id: sections.some(x => x.id === id) ? id : 'overview', keyword: params.get('keyword') || '', filter: params.get('filter') || '' }; };
const route = ref(parseHash());
const current = computed(() => sections.find(x => x.id === route.value.id)!);
const routeKey = computed(() => JSON.stringify(route.value));
const connected = ref<boolean | null>(null); const connectionError = ref('');
let timer: ReturnType<typeof setInterval>;
function updateRoute() { route.value = parseHash(); }
function navigate(page: string, keyword = '', filter = '') {
  const params = new URLSearchParams({page}); if (keyword) params.set('keyword', keyword); if (filter) params.set('filter', filter);
  location.hash = params.toString();
}
async function health() { try { await request('/health'); connected.value = true; connectionError.value = ''; } catch (e) { connected.value = false; connectionError.value = e instanceof Error ? e.message : '无法连接服务'; } }
onMounted(() => { window.addEventListener('hashchange', updateRoute); health(); timer = setInterval(health, 30000); });
onUnmounted(() => { window.removeEventListener('hashchange', updateRoute); clearInterval(timer); });
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar"><a class="brand" href="#page=overview"><span class="brand-mark">S</span><span>SECUREBASE<small>漏洞与组件信息管理</small></span></a><p class="nav-caption">工作空间</p>
      <nav aria-label="主导航"><button v-for="section in sections" :key="section.id" :aria-label="section.name" :class="{active: route.id === section.id}" @click="navigate(section.id)"><svg class="nav-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path v-if="section.id === 'overview'" d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" /><path v-else-if="section.id === 'vulnerabilities'" d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm0 5v6m0 3v1" /><path v-else-if="section.id === 'components'" d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5M12 12v10" /><path v-else d="M5 3h14v18H5zM8 7h8M8 12h8M8 17h5" /></svg>{{ section.name }}</button></nav>
      <div class="sidebar-footer"><span class="small-dot"></span>本地数据工作台<small>现代 Web 开发 · Part 1</small></div>
    </aside>
    <div class="workspace"><header class="topbar"><span>工作空间 <span class="breadcrumb-divider">/</span> <strong>{{ current.name }}</strong></span><button class="connection" :class="{offline: connected === false}" @click="health" :title="connectionError || '点击重新检查连接'"><i></i>{{ connected === null ? '连接中' : connected ? '服务正常' : '连接异常' }}</button></header>
      <main class="main-content"><el-alert v-if="connected === false" :title="connectionError || '无法连接后端或数据库，请检查服务后重试'" type="error" show-icon :closable="false" class="connection-alert" />
        <Dashboard v-if="route.id === 'overview'" @navigate="navigate" />
        <Manager v-else-if="route.id === 'vulnerabilities' || route.id === 'components'" :key="routeKey" :resource="route.id" :initial-keyword="route.keyword" :initial-filter="route.filter" />
        <Logs v-else />
        <footer class="page-footer">SECUREBASE · 数据更新写入 MySQL，重启后仍然保留。</footer>
      </main>
    </div>
  </div>
</template>
