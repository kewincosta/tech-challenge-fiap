{{/* The name every object of the application takes: the release name, or the release and chart names. */}}
{{- define "workshop.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "workshop.mailpit.fullname" -}}
{{- printf "%s-mailpit" (include "workshop.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* The name of the hook objects the migration reads. */}}
{{- define "workshop.migration.fullname" -}}
{{- printf "%s-migrate" (include "workshop.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "workshop.image" -}}
{{- printf "%s:%s" .Values.image.repository (toString .Values.image.tag) -}}
{{- end -}}

{{/* The labels that select the pods of one part of the application: the API, Mailpit or the migration. */}}
{{- define "workshop.selectorLabels" -}}
app.kubernetes.io/name: {{ .context.Chart.Name }}
app.kubernetes.io/instance: {{ .context.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/* The labels every object carries, with the selector labels of the part it belongs to. */}}
{{- define "workshop.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .context.Chart.Name .context.Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/managed-by: {{ .context.Release.Service }}
{{ include "workshop.selectorLabels" . }}
{{- end -}}

{{/*
The values no file holds, because only the deploy knows them. The render stops and names every one
that is missing.
*/}}
{{- define "workshop.requireDeployValues" -}}
{{- $missing := list -}}
{{- if not .Values.image.repository -}}{{- $missing = append $missing "image.repository" -}}{{- end -}}
{{- if not .Values.image.tag -}}{{- $missing = append $missing "image.tag" -}}{{- end -}}
{{- range $name := list "DATABASE_HOST" "DATABASE_NAME" "DATABASE_USER" "REDIS_HOST" "APP_PUBLIC_URL" -}}
{{- if not (get $.Values.config $name) -}}{{- $missing = append $missing (printf "config.%s" $name) -}}{{- end -}}
{{- end -}}
{{- range $name := list "DATABASE_PASSWORD" "JWT_SECRET" -}}
{{- if not (get $.Values.secrets $name) -}}{{- $missing = append $missing (printf "secrets.%s" $name) -}}{{- end -}}
{{- end -}}
{{- if $missing -}}
{{- fail (printf "Set %s. No values file holds them: the deploy passes them (see k8s/README.md)." (join ", " $missing)) -}}
{{- end -}}
{{- end -}}

{{/*
The settings that are not secret, every value a string. A whole number that arrives as a float, from
a values file or a release being reused, is written without an exponent. The port is the container's,
and the Mailpit of the release is the mail server unless a file names another.
*/}}
{{- define "workshop.settings" -}}
{{- $settings := dict -}}
{{- range $key, $value := .Values.config -}}
{{- if and (kindIs "float64" $value) (eq (floor $value) $value) -}}{{- $value = int64 $value -}}{{- end -}}
{{- $_ := set $settings $key (toString $value) -}}
{{- end -}}
{{- $_ := set $settings "PORT" (toString .Values.containerPort) -}}
{{- if and .Values.mailpit.enabled (not (get $settings "SMTP_HOST")) -}}
{{- $_ := set $settings "SMTP_HOST" (include "workshop.mailpit.fullname" .) -}}
{{- end -}}
{{- toYaml $settings -}}
{{- end -}}

{{/* The data of the ConfigMap, one line a setting, in key order. An empty value is left out. */}}
{{- define "workshop.configData" -}}
{{- $lines := list -}}
{{- range $key, $value := (include "workshop.settings" . | fromYaml) -}}
{{- if $value -}}{{- $lines = append $lines (printf "%s: %s" $key (quote $value)) -}}{{- end -}}
{{- end -}}
{{- join "\n" $lines -}}
{{- end -}}

{{/* The data of the Secret, encoded. */}}
{{- define "workshop.secretData" -}}
{{- $lines := list -}}
{{- range $key, $value := .Values.secrets -}}
{{- if $value -}}{{- $lines = append $lines (printf "%s: %s" $key (toString $value | b64enc | quote)) -}}{{- end -}}
{{- end -}}
{{- join "\n" $lines -}}
{{- end -}}

{{/* What the migration reads is the database's part of both: the host, the credentials and the TLS. */}}
{{- define "workshop.migration.configData" -}}
{{- $lines := list -}}
{{- range $key, $value := (include "workshop.settings" . | fromYaml) -}}
{{- if and $value (hasPrefix "DATABASE_" $key) -}}{{- $lines = append $lines (printf "%s: %s" $key (quote $value)) -}}{{- end -}}
{{- end -}}
{{- join "\n" $lines -}}
{{- end -}}

{{- define "workshop.migration.secretData" -}}
{{- printf "DATABASE_PASSWORD: %s" (toString .Values.secrets.DATABASE_PASSWORD | b64enc | quote) -}}
{{- end -}}
