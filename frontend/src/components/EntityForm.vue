<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { request, HttpError, severityNames, type Resource, type Entity } from '../api';
import { getFields } from '../fields';

const props = defineProps<{ resource: Resource; record: Entity | null; open: boolean }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const form = reactive<Record<string, any>>({});
const formRef = ref<FormInstance>();
const saving = ref(false);
const serverError = ref('');
const fieldErrors = ref<Record<string, string>>({});
const mode = ref('maven');
const fields = computed(() => getFields(props.resource));
const creating = computed(() => !props.record);
const maven = computed(() => props.resource === 'components' && creating.value && mode.value === 'maven');
const generatedPurl = computed(() => form.groupId && form.artifactId && form.version ? `pkg:maven/${encodeURIComponent(form.groupId.trim())}/${encodeURIComponent(form.artifactId.trim())}@${encodeURIComponent(form.version.trim())}` : '');
watch(() => props.open, open => {
  if (!open) return;
  for (const key of Object.keys(form)) delete form[key];
  serverError.value = ''; fieldErrors.value = {}; mode.value = 'maven';
  for (const field of fields.value) {
    const value = props.record?.[field.key];
    form[field.key] = field.kind === 'array' ? (value || []).join('\n') : field.kind === 'score' ? value ?? undefined : value ?? '';
  }
  form.groupId = ''; form.artifactId = '';
});

const rules = computed<FormRules>(() => {
  const result: FormRules = {};
  for (const field of fields.value) {
    const required = field.required || (field.key === 'version' && creating.value);
    if (required) result[field.key] = [{ validator: (_rule, value, callback) => typeof value === 'string' && value.trim() ? callback() : callback(new Error('此项为必填项')), trigger: 'blur' }];
    if (field.key === 'repository' || field.key === 'source_link') result[field.key] = [{ validator: (_rule, value, callback) => {
      if (!value) return callback();
      try { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); callback(); } catch { callback(new Error('请输入 http:// 或 https:// 链接')); }
    }, trigger: 'blur' }];
  }
  for (const key of ['groupId', 'artifactId']) result[key] = [{ required: true, message: '此项为必填项', trigger: 'blur' }, { pattern: /^[a-zA-Z0-9_.-]+$/, message: '只允许字母、数字、点、下划线和连字符', trigger: 'blur' }];
  return result;
});

async function save() {
  serverError.value = ''; fieldErrors.value = {};
  if (maven.value) { form.purl = generatedPurl.value; form.name = form.artifactId.trim(); form.vendor = form.groupId.trim(); form.type = 'maven'; }
  if (!(await formRef.value?.validate().catch(() => false))) return;
  const payload: Record<string, any> = {};
  for (const field of fields.value) {
    const value = form[field.key];
    payload[field.key] = field.kind === 'array' ? (String(value).trim() ? String(value).split('\n').map(x => x.trim()).filter(Boolean) : null)
      : field.kind === 'score' ? value ?? null
      : field.key === 'version' ? value : value === '' ? null : value;
  }
  if (props.record) payload.revision = props.record.revision;
  saving.value = true;
  try {
    await request(`/${props.resource}${props.record ? `/${props.record.id}` : ''}`, { method: creating.value ? 'POST' : 'PATCH', body: JSON.stringify(payload) });
    ElMessage.success(creating.value ? '组件已创建' : '修改已保存'); emit('saved');
  } catch (error) {
    serverError.value = error instanceof Error ? error.message : '保存失败';
    if (error instanceof HttpError) fieldErrors.value = error.fields;
  } finally { saving.value = false; }
}
</script>

<template>
  <el-dialog :model-value="open" :title="creating ? '新增组件' : resource === 'components' ? '编辑组件' : '编辑漏洞'" width="760px" class="entity-dialog" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @close="emit('close')" destroy-on-close>
    <el-alert v-if="serverError" :title="serverError" type="error" :closable="false" show-icon class="form-notice" />
    <p v-if="record && resource === 'vulnerabilities'" class="record-label mono">{{ record.cve_id }} · ID {{ record.id }}</p>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="save">
      <template v-if="creating">
        <el-form-item label="录入方式"><el-radio-group v-model="mode"><el-radio-button value="maven">Maven 坐标</el-radio-button><el-radio-button value="custom">通用组件</el-radio-button></el-radio-group></el-form-item>
        <div v-if="maven" class="form-grid">
          <el-form-item label="groupId" prop="groupId"><el-input v-model="form.groupId" aria-label="groupId" placeholder="org.example" maxlength="255" /></el-form-item>
          <el-form-item label="artifactId" prop="artifactId"><el-input v-model="form.artifactId" aria-label="artifactId" placeholder="demo-library" maxlength="255" /></el-form-item>
          <el-form-item label="版本" prop="version"><el-input v-model="form.version" aria-label="版本" placeholder="1.0.0" maxlength="255" /></el-form-item>
          <el-form-item label="生成的 PURL" :error="fieldErrors.purl"><el-input :model-value="generatedPurl" aria-label="生成的 PURL" readonly /></el-form-item>
        </div>
      </template>
      <div class="form-grid">
        <template v-for="field in fields" :key="field.key">
          <el-form-item v-if="!(maven && ['purl', 'name', 'version', 'vendor', 'type'].includes(field.key))" :label="field.label" :prop="field.key" :error="fieldErrors[field.key]" :class="{'wide-field': ['textarea', 'array'].includes(field.kind || '') || field.key === 'purl' || field.key === 'title'}">
            <el-input-number v-if="field.kind === 'score'" v-model="form[field.key]" :min="0" :max="10" :precision="1" :step="0.1" :aria-label="field.label" controls-position="right" placeholder="未评分" />
            <el-select v-else-if="field.kind === 'severity'" v-model="form[field.key]" :aria-label="field.label" placeholder="选择严重程度" clearable><el-option v-for="(name, value) in severityNames" :key="value" :label="`${name} (${value})`" :value="value" /></el-select>
            <el-date-picker v-else-if="field.kind === 'date'" v-model="form[field.key]" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" :aria-label="field.label" placeholder="选择日期时间" />
            <el-input v-else v-model="form[field.key]" :aria-label="field.label" :type="['textarea', 'array'].includes(field.kind || '') ? 'textarea' : 'text'" :rows="field.kind === 'textarea' ? 4 : 3" :maxlength="field.max" :show-word-limit="Boolean(field.max && field.kind === 'textarea')" :placeholder="field.kind === 'array' ? '每行填写一项；留空表示未提供' : undefined" />
            <small v-if="field.key === 'version' && !creating" class="field-hint">历史记录可能没有版本；允许保留空值。</small>
          </el-form-item>
        </template>
      </div>
    </el-form>
    <template #footer><el-button :disabled="saving" @click="emit('close')">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
  </el-dialog>
</template>
