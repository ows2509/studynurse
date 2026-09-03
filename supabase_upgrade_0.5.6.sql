-- StudyNurse v0.5.6 NON-DESTRUCTIVE QUIZ HOTFIX
insert into public.study_revision_log(doc_key,payload,source_version,reason)
select d.doc_key,d.payload,coalesce(d.payload->>'version','legacy'),'upgrade-baseline-v0.5.6'
from public.study_documents d
where exists(select 1 from information_schema.tables where table_schema='public' and table_name='study_revision_log')
and not exists(select 1 from public.study_revision_log l where l.doc_key=d.doc_key and l.reason='upgrade-baseline-v0.5.6');
