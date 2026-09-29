<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { request, labelSeverity, severityNames, severityColors, score, text, type Resource, type Entity, type Page } from '../api';
import { getFields } from '../fields';
import EntityForm from './EntityForm.vue';

const props = defineProps<{ resource: Resource; initialKeyword?: string; initialFilter?: string }>();
const isCve = computed(() => props.resource === 'vulnerabilities');
const keyword = ref(props.initialKeyword || '');
const filter = ref(props.initialFilter || '');
const page = ref(1); const pageSize = ref(20); const total = ref(0);
const items = ref<Entity[]>([]); const loading = ref(false); const error = ref('');
const editing = ref<Entity | null>(null); const formOpen = ref(false);
const detail = ref<Entity | null>(null); const detailOpen = ref(false); const detailLoading = ref(false); const detailError = ref('');
const busyId = ref<number | null>(null);
const ecosystems = ref<string[]>([]);
let loadSequence = 0;
let detailSequence = 0;

async function load() {
  const sequence = ++loadSequence;
  loading.value = true; error.value = '';
  const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) });
  if (keyword.value.trim()) params.set('keyword', keyword.value.trim());
  if (filter.value) params.set(isCve.value ? 'severity' : 'type', filter.value);
  try {
    const result = await request<Page<Entity>>(`/${props.resource}?${params}`);
    if (sequence !== loadSequence) return;
    if (!result.items.length && result.total > 0 && page.value > Math.ceil(result.total / pageSize.value)) { page.value = Math.ceil(result.total / pageSize.value); await load(); return; }
    items.value = result.items; total.value = result.total;
  } catch (e) { if (sequence === loadSequence) { error.value = e instanceof Error ? e.message : '列表加载失败'; items.value = []; } }
  finally { if (sequence === loadSequence) loading.value = false; }
}
function search() { page.value = 1; load(); }
function reset() { keyword.value = ''; filter.value = ''; search(); }
async function view(row: Entity) {
  const sequence = ++detailSequence;
  detailOpen.value = true; detailLoading.value = true; detail.value = null; detailError.value = '';
  try { const result = await request<Entity>(`/${props.resource}/${row.id}`); if (sequence === detailSequence) detail.value = result; }
  catch (e) { if (sequence === detailSequence) detailError.value = e instanceof Error ? e.message : '加载失败'; }
  finally { if (sequence === detailSequence) detailLoading.value = false; }
}
async function edit(row: Entity) {
  busyId.value = row.id;
  try { editing.value = await request<Entity>(`/${props.resource}/${row.id}`); detailOpen.value = false; formOpen.value = true; }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '加载失败'); }
  finally { busyId.value = null; }
}
function create() { editing.value = null; formOpen.value = true; }
async function remove(row: Entity) {
  try { await ElMessageBox.confirm(`确定删除 ${isCve.value ? row.cve_id || `#${row.id}` : row.name}（ID ${row.id}）？此操作不可撤销。`, '删除确认', { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' }); }
  catch { return; }
  busyId.value = row.id;
  try { await request(`/${props.resource}/${row.id}?revision=${row.revision}`, { method: 'DELETE' }); ElMessage.success('记录已删除'); detailOpen.value = false; await load(); }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '删除失败'); }
  finally { busyId.value = null; }
}
function saved() { formOpen.value = false; load(); }
function safeUrl(value: unknown) { try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
onMounted(async () => {
  load();
  if (!isCve.value) {
    try { const stats = await request<{ecosystems: {label: string}[]}>('/stats'); ecosystems.value = [...new Set(['maven', ...stats.ecosystems.map(x => x.label)])]; } catch { ecosystems.value = ['maven']; }
  }
});
</script>

<template>
  <div class="page-heading"><div><p class="eyebrow">{{ isCve ? 'VULNERABILITY DATABASE' : 'COMPONENT INVENTORY' }}</p><h1>{{ isCve ? 'CVE 漏洞管理' : 'Maven 组件管理' }}</h1><p class="subtitle">{{ isCve ? '检索漏洞、了解影响范围并维护记录。初始数据来自教师 SQL。' : '管理 Maven 与其他生态的开源组件，维护版本和来源信息。' }}</p></div><el-button v-if="!isCve" type="primary" @click="create">＋ 新增组件</el-button></div>
  <section class="panel list-panel">
    <form class="search-toolbar" @submit.prevent="search">
      <el-input v-model="keyword" aria-label="搜索关键词" :placeholder="isCve ? '搜索 ID、CVE 编号、标题或描述' : '搜索 ID、组件名称或 PURL'" maxlength="200" clearable @clear="search" />
      <el-select v-model="filter" aria-label="筛选条件" :placeholder="isCve ? '全部严重程度' : '全部生态'" clearable @change="search">
        <template v-if="isCve"><el-option label="高危与严重" value="HIGH_RISK" /><el-option v-for="(name, value) in severityNames" :key="value" :label="name" :value="value" /></template>
        <template v-else><el-option v-for="value in ecosystems" :key="value" :label="value === 'unknown' ? '未标注生态' : value" :value="value" /></template>
      </el-select>
      <el-button type="primary" native-type="submit" :loading="loading">搜索</el-button><el-button @click="reset">重置</el-button>
    </form>
    <div class="result-caption"><span>共 <strong>{{ total }}</strong> 条记录</span><span>{{ isCve ? '评分优先显示 CVSS v4 / v3 / v2' : 'PURL 是组件的唯一业务标识' }}</span></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon><el-button link type="primary" @click="load">重试</el-button></el-alert>
    <el-table v-loading="loading" :data="items" row-key="id" stripe :empty-text="error ? '加载失败，请重试' : loading ? '正在加载…' : '没有找到匹配记录，请调整搜索条件'">
      <el-table-column prop="id" label="ID" width="80" />
      <template v-if="isCve">
        <el-table-column label="CVE 编号" width="195"><template #default="{row}"><el-button link type="primary" class="mono" @click="view(row)">{{ row.cve_id || `#${row.id}` }}</el-button></template></el-table-column>
        <el-table-column label="标题 / 描述" min-width="270"><template #default="{row}"><span class="record-summary">{{ row.title || row.description || '未提供描述' }}</span></template></el-table-column>
        <el-table-column label="严重程度" width="115"><template #default="{row}"><span class="risk-tag" :style="{color: severityColors[row.severity || 'UNKNOWN']}">{{ labelSeverity(row.severity) }}</span></template></el-table-column>
        <el-table-column label="评分" width="80"><template #default="{row}"><span class="mono">{{ score(row) }}</span></template></el-table-column>
        <el-table-column label="发布时间" width="125"><template #default="{row}">{{ row.source_publish_date?.slice(0, 10) || '—' }}</template></el-table-column>
      </template>
      <template v-else>
        <el-table-column label="组件名称" min-width="180"><template #default="{row}"><el-button link type="primary" @click="view(row)">{{ row.name }}</el-button><small class="subline">{{ row.vendor || '未标注厂商' }}</small></template></el-table-column>
        <el-table-column label="版本" width="105"><template #default="{row}">{{ row.version || '未提供' }}</template></el-table-column>
        <el-table-column label="生态" width="115"><template #default="{row}"><el-tag type="info" effect="plain">{{ row.type || '未标注' }}</el-tag></template></el-table-column>
        <el-table-column label="PURL" min-width="260"><template #default="{row}"><span class="mono record-summary">{{ row.purl }}</span></template></el-table-column>
      </template>
      <el-table-column label="操作" width="182" fixed="right"><template #default="{row}"><el-button link @click="view(row)">详情</el-button><el-button link type="primary" :disabled="busyId !== null" @click="edit(row)">编辑</el-button><el-button link type="danger" :disabled="busyId !== null" @click="remove(row)">删除</el-button></template></el-table-column>
    </el-table>
    <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10, 20, 50, 100]" :total="total" layout="total, sizes, prev, pager, next" @current-change="load" @size-change="search" />
  </section>
  <EntityForm :resource="resource" :record="editing" :open="formOpen" @close="formOpen = false" @saved="saved" />
  <el-drawer v-model="detailOpen" :title="isCve ? '漏洞详情' : '组件详情'" size="min(760px, 96vw)" @closed="detailSequence++">
    <el-skeleton v-if="detailLoading" :rows="12" animated />
    <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" show-icon />
    <template v-if="detail">
      <p class="eyebrow">RECORD #{{ detail.id }}</p><h2 class="detail-title">{{ isCve ? detail.cve_id : detail.name }}</h2>
      <p v-if="isCve" class="detail-description">{{ detail.title || '原标题未提供' }}</p>
      <div class="detail-actions"><el-button type="primary" @click="edit(detail)">编辑记录</el-button><el-button type="danger" plain @click="remove(detail)">删除记录</el-button></div>
      <dl class="detail-list"><template v-for="field in getFields(resource)" :key="field.key"><dt>{{ field.label }}</dt><dd><a v-if="['repository', 'source_link'].includes(field.key) && safeUrl(detail[field.key])" :href="safeUrl(detail[field.key])" target="_blank" rel="noopener noreferrer">{{ detail[field.key] }}</a><span v-else>{{ field.key === 'severity' ? labelSeverity(detail[field.key]) : text(detail[field.key]) }}</span></dd></template>
        <dt>本系统更新时间（UTC）</dt><dd>{{ text(detail.updated_at) }}</dd><dt>记录版本</dt><dd>{{ detail.revision }}</dd>
      </dl>
    </template>
  </el-drawer>
</template>
