<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { request, type Page, type Entity } from '../api';
const items = ref<Entity[]>([]); const page = ref(1); const total = ref(0); const loading = ref(false); const error = ref('');
const detail = ref<Entity | null>(null); const open = ref(false); const detailError = ref(''); const detailLoading = ref(false);
const names: Record<string, string> = {create: '新增', update: '修改', delete: '删除'};
async function load() {
  loading.value = true; error.value = '';
  try { const result = await request<Page<Entity>>(`/operation-logs?page=${page.value}&pageSize=20`); items.value = result.items; total.value = result.total; }
  catch (e) { error.value = e instanceof Error ? e.message : '加载失败'; }
  finally { loading.value = false; }
}
async function view(row: Entity) {
  open.value = true; detail.value = null; detailError.value = ''; detailLoading.value = true;
  try { detail.value = await request<Entity>(`/operation-logs/${row.id}`); }
  catch (e) { detailError.value = e instanceof Error ? e.message : '加载失败'; }
  finally { detailLoading.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="page-heading"><div><p class="eyebrow">CHANGE HISTORY</p><h1>操作日志</h1><p class="subtitle">记录每次新增、修改与删除，保留变更前后的数据快照。</p></div><el-button :loading="loading" @click="load">刷新日志</el-button></div>
  <section class="panel list-panel"><el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-table :data="items" v-loading="loading" empty-text="暂无操作记录，完成一次数据修改后会显示在这里。" stripe>
      <el-table-column prop="id" label="日志 ID" width="95" />
      <el-table-column label="模块" width="110"><template #default="{row}">{{ row.resource === 'components' ? '组件' : '漏洞' }}</template></el-table-column>
      <el-table-column label="操作" width="100"><template #default="{row}"><el-tag :type="row.action === 'delete' ? 'danger' : row.action === 'create' ? 'success' : 'primary'">{{ names[row.action] }}</el-tag></template></el-table-column>
      <el-table-column prop="summary" label="记录标识" min-width="280" show-overflow-tooltip />
      <el-table-column prop="created_at" label="时间（UTC）" width="190" />
      <el-table-column label="详情" width="110"><template #default="{row}"><el-button link type="primary" @click="view(row)">查看变更</el-button></template></el-table-column>
    </el-table><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next" @current-change="load" />
  </section>
  <el-drawer v-model="open" title="变更详情" size="min(900px, 96vw)"><el-skeleton v-if="detailLoading" :rows="8" animated /><el-alert v-if="detailError" :title="detailError" type="error" :closable="false" /><template v-if="detail"><p class="mono">{{ detail.summary }}</p><p>{{ names[detail.action] }} · {{ detail.created_at }} UTC</p><h3>变更前</h3><pre class="snapshot">{{ JSON.stringify(detail.before_data, null, 2) }}</pre><h3>变更后</h3><pre class="snapshot">{{ JSON.stringify(detail.after_data, null, 2) }}</pre></template></el-drawer>
</template>
