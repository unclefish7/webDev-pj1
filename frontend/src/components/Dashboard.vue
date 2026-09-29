<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { request, labelSeverity, severityColors, type Entity } from '../api';
interface Stats { vulnerabilities: number; components: number; highRisk: number; operations: number; severity: {label: string; count: number}[]; ecosystems: {label: string; count: number}[]; recent: Entity[]; }
const emit = defineEmits<{ navigate: [page: string, keyword?: string, filter?: string] }>();
const stats = ref<Stats>();
const loading = ref(false);
const error = ref('');
async function load() {
  loading.value = true; error.value = '';
  try { stats.value = await request<Stats>('/stats'); }
  catch (e) { error.value = e instanceof Error ? e.message : '加载失败'; }
  finally { loading.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="page-heading"><div><p class="eyebrow">SECURITY OVERVIEW</p><h1>风险概览</h1><p class="subtitle">了解漏洞风险与组件资产，所有统计来自当前数据库。</p></div><el-button @click="load" :loading="loading">刷新数据</el-button></div>
  <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
  <el-skeleton v-if="loading && !stats" :rows="8" animated />
  <template v-if="stats">
    <div class="metrics">
      <button class="metric" @click="emit('navigate', 'vulnerabilities')"><span>漏洞记录</span><strong>{{ stats.vulnerabilities.toLocaleString() }}</strong><small>CVE 漏洞知识库 <span>↗</span></small></button>
      <button class="metric risk" @click="emit('navigate', 'vulnerabilities', '', 'HIGH_RISK')"><span>高危与严重漏洞</span><strong>{{ stats.highRisk.toLocaleString() }}</strong><small>HIGH + CRITICAL · 查看全部 <span>↗</span></small></button>
      <button class="metric" @click="emit('navigate', 'components')"><span>组件资产</span><strong>{{ stats.components.toLocaleString() }}</strong><small>Maven 与其他开源生态 <span>↗</span></small></button>
      <button class="metric" @click="emit('navigate', 'logs')"><span>变更记录</span><strong>{{ stats.operations.toLocaleString() }}</strong><small>新增、修改与删除 <span>↗</span></small></button>
    </div>
    <div class="chart-grid">
      <section class="panel"><div class="panel-heading"><h2>漏洞严重程度</h2><span>点击分布查看记录</span></div>
        <el-empty v-if="!stats.severity.length" description="暂无漏洞数据" />
        <button v-for="item in stats.severity" :key="item.label" class="bar-row" @click="emit('navigate', 'vulnerabilities', '', item.label)">
          <span class="bar-label"><i :style="{background: severityColors[item.label] || '#8795a6'}"></i>{{ labelSeverity(item.label) }}</span>
          <span class="bar-track"><span :style="{width: `${Math.max(1, item.count / Math.max(stats.vulnerabilities, 1) * 100)}%`, background: severityColors[item.label] || '#8795a6'}"></span></span>
          <strong>{{ item.count }}</strong>
        </button>
      </section>
      <section class="panel"><div class="panel-heading"><h2>组件生态分布</h2><span>{{ stats.ecosystems.length }} 类生态</span></div>
        <el-empty v-if="!stats.ecosystems.length" description="暂无组件数据" />
        <div class="ecosystems"><button v-for="item in stats.ecosystems" :key="item.label" @click="emit('navigate', 'components', '', item.label)"><span>{{ item.label === 'unknown' ? '未标注生态' : item.label }}</span><strong>{{ item.count }}</strong></button></div>
      </section>
    </div>
    <section class="panel"><div class="panel-heading"><h2>最近发布的漏洞</h2><el-button link type="primary" @click="emit('navigate', 'vulnerabilities')">查看全部 →</el-button></div>
      <el-empty v-if="!stats.recent.length" description="暂无漏洞数据" />
      <button v-for="row in stats.recent" :key="row.id" class="recent-row" @click="emit('navigate', 'vulnerabilities', row.cve_id)"><div><span class="mono cve-link">{{ row.cve_id || `#${row.id}` }}</span><p>{{ row.title || row.description || '未提供描述' }}</p></div><span class="risk-tag" :style="{color: severityColors[row.severity || 'UNKNOWN']}">{{ labelSeverity(row.severity) }}</span></button>
    </section>
  </template>
</template>
