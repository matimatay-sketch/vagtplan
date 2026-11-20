
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "absence": {
                  Row: {
                    "created_at": string,"days_hundredths": number | null,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"employee_id": string,"from_date": string,"id": string,"note": string | null,"organization_id": string,"requested_by": string | null,"status": Database["public"]['Enums']["absence_status"],"to_date": string,"type_code": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"days_hundredths"?: number | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"employee_id": string,"from_date": string,"id"?: string,"note"?: string | null,"organization_id": string,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["absence_status"],"to_date": string,"type_code": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"days_hundredths"?: number | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"employee_id"?: string,"from_date"?: string,"id"?: string,"note"?: string | null,"organization_id"?: string,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["absence_status"],"to_date"?: string,"type_code"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "absence_organization_id_employee_id_fkey"
      columns: ["organization_id","employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "absence_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"agreement": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_example": boolean,"key": string,"kind": Database["public"]['Enums']["agreement_kind"],"name": string,"organization_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_example"?: boolean,"key": string,"kind": Database["public"]['Enums']["agreement_kind"],"name": string,"organization_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_example"?: boolean,"key"?: string,"kind"?: Database["public"]['Enums']["agreement_kind"],"name"?: string,"organization_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agreement_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"agreement_test_case": {
                  Row: {
                    "agreement_id": string,"archived_at": string | null,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"name": string,"organization_id": string,"test": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement_id": string,"archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"name": string,"organization_id": string,"test": NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "agreement_id"?: string,"archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"name"?: string,"organization_id"?: string,"test"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agreement_test_case_agreement_id_fkey"
      columns: ["agreement_id"]
isOneToOne: false
      referencedRelation: "agreement"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agreement_test_case_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"agreement_version": {
                  Row: {
                    "agreement_id": string,"created_at": string,"document": NonNullable<Json>,"id": string,"published_at": string | null,"published_by": string | null,"status": Database["public"]['Enums']["agreement_version_status"],"valid_from": string,"valid_to": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement_id": string,"created_at"?: string,"document": NonNullable<Json>,"id"?: string,"published_at"?: string | null,"published_by"?: string | null,"status"?: Database["public"]['Enums']["agreement_version_status"],"valid_from": string,"valid_to"?: string | null,"version": number
                  }
                  Update: {
                    "agreement_id"?: string,"created_at"?: string,"document"?: NonNullable<Json>,"id"?: string,"published_at"?: string | null,"published_by"?: string | null,"status"?: Database["public"]['Enums']["agreement_version_status"],"valid_from"?: string,"valid_to"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agreement_version_agreement_id_fkey"
      columns: ["agreement_id"]
isOneToOne: false
      referencedRelation: "agreement"
      referencedColumns: ["id"]
    }
                  ]
                },"api_key": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"key_hash": string,"last_used_at": string | null,"name": string,"organization_id": string,"prefix": string,"revoked_at": string | null,"scopes": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"key_hash": string,"last_used_at"?: string | null,"name": string,"organization_id": string,"prefix": string,"revoked_at"?: string | null,"scopes": (string)[]
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"key_hash"?: string,"last_used_at"?: string | null,"name"?: string,"organization_id"?: string,"prefix"?: string,"revoked_at"?: string | null,"scopes"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_key_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"assistant_proposal": {
                  Row: {
                    "created_at": string,"created_by": string,"department_id": string,"discarded_at": string | null,"id": string,"note": string | null,"organization_id": string,"week_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"department_id": string,"discarded_at"?: string | null,"id"?: string,"note"?: string | null,"organization_id": string,"week_start": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"department_id"?: string,"discarded_at"?: string | null,"id"?: string,"note"?: string | null,"organization_id"?: string,"week_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assistant_proposal_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "assistant_proposal_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"assistant_request": {
                  Row: {
                    "created_at": string,"department_id": string | null,"id": string,"input_tokens": number,"kind": string,"model": string,"organization_id": string,"outcome": string,"output_tokens": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"department_id"?: string | null,"id"?: string,"input_tokens"?: number,"kind": string,"model": string,"organization_id": string,"outcome": string,"output_tokens"?: number,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"department_id"?: string | null,"id"?: string,"input_tokens"?: number,"kind"?: string,"model"?: string,"organization_id"?: string,"outcome"?: string,"output_tokens"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assistant_request_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "assistant_request_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"before": Json | null,"created_at": string,"id": number,"impersonator_id": string | null,"organization_id": string | null,"row_id": string,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: never,"impersonator_id"?: string | null,"organization_id"?: string | null,"row_id": string,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: never,"impersonator_id"?: string | null,"organization_id"?: string | null,"row_id"?: string,"table_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"availability": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"date": string,"employee_id": string,"from_time": string | null,"id": string,"kind": Database["public"]['Enums']["availability_kind"],"note": string | null,"organization_id": string,"to_time": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"date": string,"employee_id": string,"from_time"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["availability_kind"],"note"?: string | null,"organization_id": string,"to_time"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"date"?: string,"employee_id"?: string,"from_time"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["availability_kind"],"note"?: string | null,"organization_id"?: string,"to_time"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "availability_organization_id_employee_id_fkey"
      columns: ["organization_id","employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "availability_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"bulletin_post": {
                  Row: {
                    "archived_at": string | null,"body": string,"created_at": string,"created_by": string | null,"department_id": string | null,"expires_on": string | null,"id": string,"organization_id": string,"pinned": boolean,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"body"?: string,"created_at"?: string,"created_by"?: string | null,"department_id"?: string | null,"expires_on"?: string | null,"id"?: string,"organization_id": string,"pinned"?: boolean,"title": string
                  }
                  Update: {
                    "archived_at"?: string | null,"body"?: string,"created_at"?: string,"created_by"?: string | null,"department_id"?: string | null,"expires_on"?: string | null,"id"?: string,"organization_id"?: string,"pinned"?: boolean,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bulletin_post_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "bulletin_post_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"contract": {
                  Row: {
                    "agreement_id": string,"created_at": string,"employee_id": string,"exempt_from_registration": boolean,"exemption_reason": string | null,"exemption_since": string | null,"id": string,"local_agreement_id": string | null,"organization_id": string,"overrides": NonNullable<Json>,"pay_form": Database["public"]['Enums']["pay_form"],"pay_period_group_id": string,"pay_step": string | null,"seniority_date": string | null,"staff_group": string | null,"valid_from": string,"valid_to": string | null,"weekly_norm_minutes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement_id": string,"created_at"?: string,"employee_id": string,"exempt_from_registration"?: boolean,"exemption_reason"?: string | null,"exemption_since"?: string | null,"id"?: string,"local_agreement_id"?: string | null,"organization_id": string,"overrides"?: NonNullable<Json>,"pay_form": Database["public"]['Enums']["pay_form"],"pay_period_group_id": string,"pay_step"?: string | null,"seniority_date"?: string | null,"staff_group"?: string | null,"valid_from": string,"valid_to"?: string | null,"weekly_norm_minutes": number
                  }
                  Update: {
                    "agreement_id"?: string,"created_at"?: string,"employee_id"?: string,"exempt_from_registration"?: boolean,"exemption_reason"?: string | null,"exemption_since"?: string | null,"id"?: string,"local_agreement_id"?: string | null,"organization_id"?: string,"overrides"?: NonNullable<Json>,"pay_form"?: Database["public"]['Enums']["pay_form"],"pay_period_group_id"?: string,"pay_step"?: string | null,"seniority_date"?: string | null,"staff_group"?: string | null,"valid_from"?: string,"valid_to"?: string | null,"weekly_norm_minutes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contract_agreement_id_fkey"
      columns: ["agreement_id"]
isOneToOne: false
      referencedRelation: "agreement"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contract_local_agreement_id_fkey"
      columns: ["local_agreement_id"]
isOneToOne: false
      referencedRelation: "agreement"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contract_organization_id_employee_id_fkey"
      columns: ["organization_id","employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "contract_organization_id_pay_period_group_id_fkey"
      columns: ["organization_id","pay_period_group_id"]
isOneToOne: false
      referencedRelation: "pay_period_group"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"department": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"name": string,"organization_id": string,"posting_defaults": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name": string,"organization_id": string,"posting_defaults"?: NonNullable<Json>
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"organization_id"?: string,"posting_defaults"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "department_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"department_manager": {
                  Row: {
                    "created_at": string,"department_id": string,"organization_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"department_id": string,"organization_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"department_id"?: string,"organization_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "department_manager_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"employee": {
                  Row: {
                    "approver_user_id": string | null,"archived_at": string | null,"birth_date": string,"created_at": string,"email": string | null,"employee_number": string,"first_name": string,"hired_on": string | null,"id": string,"last_name": string,"login_placeholder": boolean,"organization_id": string,"phone": string | null,"posting_defaults": NonNullable<Json>,"school_obligated": boolean,"school_obligation_ends_on": string | null,"show_celebrations": boolean,"terminated_on": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approver_user_id"?: string | null,"archived_at"?: string | null,"birth_date": string,"created_at"?: string,"email"?: string | null,"employee_number": string,"first_name": string,"hired_on"?: string | null,"id"?: string,"last_name": string,"login_placeholder"?: boolean,"organization_id": string,"phone"?: string | null,"posting_defaults"?: NonNullable<Json>,"school_obligated"?: boolean,"school_obligation_ends_on"?: string | null,"show_celebrations"?: boolean,"terminated_on"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "approver_user_id"?: string | null,"archived_at"?: string | null,"birth_date"?: string,"created_at"?: string,"email"?: string | null,"employee_number"?: string,"first_name"?: string,"hired_on"?: string | null,"id"?: string,"last_name"?: string,"login_placeholder"?: boolean,"organization_id"?: string,"phone"?: string | null,"posting_defaults"?: NonNullable<Json>,"school_obligated"?: boolean,"school_obligation_ends_on"?: string | null,"show_celebrations"?: boolean,"terminated_on"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"employee_department": {
                  Row: {
                    "created_at": string,"department_id": string,"employee_id": string,"is_primary": boolean,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"department_id": string,"employee_id": string,"is_primary"?: boolean,"organization_id": string
                  }
                  Update: {
                    "created_at"?: string,"department_id"?: string,"employee_id"?: string,"is_primary"?: boolean,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_department_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "employee_department_organization_id_employee_id_fkey"
      columns: ["organization_id","employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"expense": {
                  Row: {
                    "amount_ore": number,"archived_at": string | null,"category_id": string,"created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"department_id": string,"description": string,"employee_id": string,"expense_date": string,"id": string,"organization_id": string,"posting_values": NonNullable<Json>,"receipt_path": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ore": number,"archived_at"?: string | null,"category_id": string,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"department_id": string,"description": string,"employee_id": string,"expense_date": string,"id"?: string,"organization_id": string,"posting_values"?: NonNullable<Json>,"receipt_path"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount_ore"?: number,"archived_at"?: string | null,"category_id"?: string,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"department_id"?: string,"description"?: string,"employee_id"?: string,"expense_date"?: string,"id"?: string,"organization_id"?: string,"posting_values"?: NonNullable<Json>,"receipt_path"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_organization_id_category_id_fkey"
      columns: ["organization_id","category_id"]
isOneToOne: false
      referencedRelation: "expense_category"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "expense_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "expense_organization_id_employee_id_fkey"
      columns: ["organization_id","employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "expense_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_category": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"name": string,"organization_id": string,"pay_code": string,"receipt_required": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name": string,"organization_id": string,"pay_code": string,"receipt_required"?: boolean
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"organization_id"?: string,"pay_code"?: string,"receipt_required"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_category_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"export_log": {
                  Row: {
                    "exported_at": string,"exported_by": string | null,"id": string,"organization_id": string,"pay_period_id": string,"row_count": number,"sha256": string,"template_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "exported_at"?: string,"exported_by"?: string | null,"id"?: string,"organization_id": string,"pay_period_id": string,"row_count": number,"sha256": string,"template_id": string
                  }
                  Update: {
                    "exported_at"?: string,"exported_by"?: string | null,"id"?: string,"organization_id"?: string,"pay_period_id"?: string,"row_count"?: number,"sha256"?: string,"template_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "export_log_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "export_log_organization_id_pay_period_id_fkey"
      columns: ["organization_id","pay_period_id"]
isOneToOne: false
      referencedRelation: "pay_period"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "export_log_organization_id_template_id_fkey"
      columns: ["organization_id","template_id"]
isOneToOne: false
      referencedRelation: "export_template"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"export_template": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"name": string,"organization_id": string,"settings": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name": string,"organization_id": string,"settings": NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"organization_id"?: string,"settings"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "export_template_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"impersonation_session": {
                  Row: {
                    "admin_user_id": string,"ended_at": string | null,"id": string,"organization_id": string,"started_at": string,"target_employee_id": string,"target_user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_user_id": string,"ended_at"?: string | null,"id"?: string,"organization_id": string,"started_at"?: string,"target_employee_id": string,"target_user_id": string
                  }
                  Update: {
                    "admin_user_id"?: string,"ended_at"?: string | null,"id"?: string,"organization_id"?: string,"started_at"?: string,"target_employee_id"?: string,"target_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "impersonation_session_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "impersonation_session_organization_id_target_employee_id_fkey"
      columns: ["organization_id","target_employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"leave_posting": {
                  Row: {
                    "absence_id": string | null,"account": string,"created_at": string,"created_by": string | null,"employee_id": string,"hundredths": number,"id": string,"kind": Database["public"]['Enums']["leave_posting_kind"],"note": string | null,"organization_id": string,"period_start": string,"posted_on": string,"usable_until": string
                  }
                  ComputedFields: never
                  Insert: {
                    "absence_id"?: string | null,"account": string,"created_at"?: string,"created_by"?: string | null,"employee_id": string,"hundredths": number,"id"?: string,"kind": Database["public"]['Enums']["leave_posting_kind"],"note"?: string | null,"organization_id": string,"period_start": string,"posted_on": string,"usable_until": string
                  }
                  Update: {
                    "absence_id"?: string | null,"account"?: string,"created_at"?: string,"created_by"?: string | null,"employee_id"?: string,"hundredths"?: number,"id"?: string,"kind"?: Database["public"]['Enums']["leave_posting_kind"],"note"?: string | null,"organization_id"?: string,"period_start"?: string,"posted_on"?: string,"usable_until"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_posting_organization_id_absence_id_fkey"
      columns: ["organization_id","absence_id"]
isOneToOne: false
      referencedRelation: "absence"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "leave_posting_organization_id_employee_id_fkey"
      columns: ["organization_id","employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "leave_posting_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"membership": {
                  Row: {
                    "created_at": string,"id": string,"organization_id": string,"profile_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"organization_id": string,"profile_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"organization_id"?: string,"profile_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "membership_profile_fk"
      columns: ["organization_id","profile_id"]
isOneToOne: false
      referencedRelation: "permission_profile"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"mileage_rate": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"high_limit_km": number,"high_rate_ore": number,"id": string,"low_rate_ore": number,"organization_id": string,"pay_code_high": string,"pay_code_low": string,"source": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"high_limit_km": number,"high_rate_ore": number,"id"?: string,"low_rate_ore": number,"organization_id": string,"pay_code_high": string,"pay_code_low": string,"source": string,"year": number
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"high_limit_km"?: number,"high_rate_ore"?: number,"id"?: string,"low_rate_ore"?: number,"organization_id"?: string,"pay_code_high"?: string,"pay_code_low"?: string,"source"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "mileage_rate_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"mileage_trip": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"department_id": string,"employee_id": string,"from_address": string,"id": string,"meters": number,"organization_id": string,"posting_values": NonNullable<Json>,"purpose": string,"status": string,"stops": NonNullable<Json>,"to_address": string,"trip_date": string,"updated_at": string,"vehicle": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"department_id": string,"employee_id": string,"from_address": string,"id"?: string,"meters": number,"organization_id": string,"posting_values"?: NonNullable<Json>,"purpose": string,"status"?: string,"stops"?: NonNullable<Json>,"to_address": string,"trip_date": string,"updated_at"?: string,"vehicle"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"department_id"?: string,"employee_id"?: string,"from_address"?: string,"id"?: string,"meters"?: number,"organization_id"?: string,"posting_values"?: NonNullable<Json>,"purpose"?: string,"status"?: string,"stops"?: NonNullable<Json>,"to_address"?: string,"trip_date"?: string,"updated_at"?: string,"vehicle"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "mileage_trip_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "mileage_trip_organization_id_employee_id_fkey"
      columns: ["organization_id","employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "mileage_trip_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"organization": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"default_profile_id": string | null,"id": string,"name": string,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"default_profile_id"?: string | null,"id"?: string,"name": string,"timezone"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"default_profile_id"?: string | null,"id"?: string,"name"?: string,"timezone"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_default_profile_fk"
      columns: ["id","default_profile_id"]
isOneToOne: false
      referencedRelation: "permission_profile"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"organization_settings": {
                  Row: {
                    "assistant_enabled": boolean,"leave_rules": NonNullable<Json>,"norm_in_pay_on_call": boolean,"norm_in_pay_work": boolean,"norm_percent_on_call": number,"norm_percent_work": number,"notice_change_hours": number | null,"notice_publish_hours": number | null,"organization_id": string,"rule_handling": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assistant_enabled"?: boolean,"leave_rules"?: NonNullable<Json>,"norm_in_pay_on_call"?: boolean,"norm_in_pay_work"?: boolean,"norm_percent_on_call"?: number,"norm_percent_work"?: number,"notice_change_hours"?: number | null,"notice_publish_hours"?: number | null,"organization_id": string,"rule_handling"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "assistant_enabled"?: boolean,"leave_rules"?: NonNullable<Json>,"norm_in_pay_on_call"?: boolean,"norm_in_pay_work"?: boolean,"norm_percent_on_call"?: number,"norm_percent_work"?: number,"notice_change_hours"?: number | null,"notice_publish_hours"?: number | null,"organization_id"?: string,"rule_handling"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_settings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"pay_line": {
                  Row: {
                    "amount_ore": number,"employee_id": string,"explanation": NonNullable<Json>,"id": string,"label": string,"organization_id": string,"pay_code": string,"pay_run_id": string,"position": number,"posting": NonNullable<Json>,"quantity_minutes": number,"rate_ore": number,"unit": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ore": number,"employee_id": string,"explanation": NonNullable<Json>,"id"?: string,"label": string,"organization_id": string,"pay_code": string,"pay_run_id": string,"position": number,"posting"?: NonNullable<Json>,"quantity_minutes": number,"rate_ore": number,"unit": string
                  }
                  Update: {
                    "amount_ore"?: number,"employee_id"?: string,"explanation"?: NonNullable<Json>,"id"?: string,"label"?: string,"organization_id"?: string,"pay_code"?: string,"pay_run_id"?: string,"position"?: number,"posting"?: NonNullable<Json>,"quantity_minutes"?: number,"rate_ore"?: number,"unit"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pay_line_organization_id_employee_id_fkey"
      columns: ["organization_id","employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "pay_line_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pay_line_organization_id_pay_run_id_fkey"
      columns: ["organization_id","pay_run_id"]
isOneToOne: false
      referencedRelation: "pay_run"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"pay_period": {
                  Row: {
                    "closed_at": string | null,"closed_by": string | null,"created_at": string,"end_date": string,"group_id": string,"id": string,"organization_id": string,"start_date": string,"status": Database["public"]['Enums']["pay_period_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"end_date": string,"group_id": string,"id"?: string,"organization_id": string,"start_date": string,"status"?: Database["public"]['Enums']["pay_period_status"]
                  }
                  Update: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"end_date"?: string,"group_id"?: string,"id"?: string,"organization_id"?: string,"start_date"?: string,"status"?: Database["public"]['Enums']["pay_period_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "pay_period_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pay_period_organization_id_group_id_fkey"
      columns: ["organization_id","group_id"]
isOneToOne: false
      referencedRelation: "pay_period_group"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"pay_period_group": {
                  Row: {
                    "anchor_date": string | null,"archived_at": string | null,"created_at": string,"frequency": Database["public"]['Enums']["pay_frequency"],"id": string,"month_start_day": number | null,"name": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anchor_date"?: string | null,"archived_at"?: string | null,"created_at"?: string,"frequency": Database["public"]['Enums']["pay_frequency"],"id"?: string,"month_start_day"?: number | null,"name": string,"organization_id": string
                  }
                  Update: {
                    "anchor_date"?: string | null,"archived_at"?: string | null,"created_at"?: string,"frequency"?: Database["public"]['Enums']["pay_frequency"],"id"?: string,"month_start_day"?: number | null,"name"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pay_period_group_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"pay_run": {
                  Row: {
                    "calculated_at": string,"calculated_by": string | null,"daily_minutes": NonNullable<Json>,"employee_id": string,"engine_version": string,"id": string,"notes": NonNullable<Json>,"organization_id": string,"pay_period_id": string,"pending_entries": number,"superseded_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "calculated_at"?: string,"calculated_by"?: string | null,"daily_minutes"?: NonNullable<Json>,"employee_id": string,"engine_version": string,"id"?: string,"notes"?: NonNullable<Json>,"organization_id": string,"pay_period_id": string,"pending_entries"?: number,"superseded_at"?: string | null
                  }
                  Update: {
                    "calculated_at"?: string,"calculated_by"?: string | null,"daily_minutes"?: NonNullable<Json>,"employee_id"?: string,"engine_version"?: string,"id"?: string,"notes"?: NonNullable<Json>,"organization_id"?: string,"pay_period_id"?: string,"pending_entries"?: number,"superseded_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pay_run_organization_id_employee_id_fkey"
      columns: ["organization_id","employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "pay_run_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pay_run_organization_id_pay_period_id_fkey"
      columns: ["organization_id","pay_period_id"]
isOneToOne: false
      referencedRelation: "pay_period"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"permission": {
                  Row: {
                    "allowed_scopes": (Database["public"]['Enums']["permission_scope"])[],"key": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_scopes": (Database["public"]['Enums']["permission_scope"])[],"key": string,"sort_order": number
                  }
                  Update: {
                    "allowed_scopes"?: (Database["public"]['Enums']["permission_scope"])[],"key"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"permission_grant": {
                  Row: {
                    "organization_id": string,"permission": string,"profile_id": string,"scope": Database["public"]['Enums']["permission_scope"]
                  }
                  ComputedFields: never
                  Insert: {
                    "organization_id": string,"permission": string,"profile_id": string,"scope": Database["public"]['Enums']["permission_scope"]
                  }
                  Update: {
                    "organization_id"?: string,"permission"?: string,"profile_id"?: string,"scope"?: Database["public"]['Enums']["permission_scope"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "permission_grant_organization_id_profile_id_fkey"
      columns: ["organization_id","profile_id"]
isOneToOne: false
      referencedRelation: "permission_profile"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "permission_grant_permission_fkey"
      columns: ["permission"]
isOneToOne: false
      referencedRelation: "permission"
      referencedColumns: ["key"]
    }
                  ]
                },"permission_profile": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"description": string | null,"id": string,"is_owner": boolean,"name": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_owner"?: boolean,"name": string,"organization_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_owner"?: boolean,"name"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "permission_profile_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_admin": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"posting_dimension": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"is_project": boolean,"key": string,"name": string,"organization_id": string,"required": boolean,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"is_project"?: boolean,"key": string,"name": string,"organization_id": string,"required"?: boolean,"sort_order"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"is_project"?: boolean,"key"?: string,"name"?: string,"organization_id"?: string,"required"?: boolean,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "posting_dimension_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"posting_value": {
                  Row: {
                    "archived_at": string | null,"code": string,"created_at": string,"description": string | null,"dimension_id": string,"id": string,"name": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"code": string,"created_at"?: string,"description"?: string | null,"dimension_id": string,"id"?: string,"name": string,"organization_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"code"?: string,"created_at"?: string,"description"?: string | null,"dimension_id"?: string,"id"?: string,"name"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posting_value_organization_id_dimension_id_fkey"
      columns: ["organization_id","dimension_id"]
isOneToOne: false
      referencedRelation: "posting_dimension"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"posting_value_department": {
                  Row: {
                    "department_id": string,"organization_id": string,"value_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "department_id": string,"organization_id": string,"value_id": string
                  }
                  Update: {
                    "department_id"?: string,"organization_id"?: string,"value_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posting_value_department_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "posting_value_department_organization_id_value_id_fkey"
      columns: ["organization_id","value_id"]
isOneToOne: false
      referencedRelation: "posting_value"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"project": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"customer": string | null,"id": string,"name": string,"number": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"customer"?: string | null,"id"?: string,"name": string,"number": string,"organization_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"customer"?: string | null,"id"?: string,"name"?: string,"number"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"project_department": {
                  Row: {
                    "department_id": string,"organization_id": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "department_id": string,"organization_id": string,"project_id": string
                  }
                  Update: {
                    "department_id"?: string,"organization_id"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_department_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "project_department_organization_id_project_id_fkey"
      columns: ["organization_id","project_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"rotation": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"department_id": string,"id": string,"length_weeks": number,"name": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"department_id": string,"id"?: string,"length_weeks": number,"name": string,"organization_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"department_id"?: string,"id"?: string,"length_weeks"?: number,"name"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rotation_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "rotation_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"rotation_line": {
                  Row: {
                    "id": string,"name": string,"organization_id": string,"position": number,"rotation_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"organization_id": string,"position": number,"rotation_id": string
                  }
                  Update: {
                    "id"?: string,"name"?: string,"organization_id"?: string,"position"?: number,"rotation_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rotation_line_organization_id_rotation_id_fkey"
      columns: ["organization_id","rotation_id"]
isOneToOne: false
      referencedRelation: "rotation"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"rotation_rollout": {
                  Row: {
                    "assignments": NonNullable<Json>,"created_at": string,"created_by": string | null,"department_id": string,"id": string,"organization_id": string,"rotation_id": string,"start_date": string,"weeks": number
                  }
                  ComputedFields: never
                  Insert: {
                    "assignments": NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"department_id": string,"id"?: string,"organization_id": string,"rotation_id": string,"start_date": string,"weeks": number
                  }
                  Update: {
                    "assignments"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"department_id"?: string,"id"?: string,"organization_id"?: string,"rotation_id"?: string,"start_date"?: string,"weeks"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "rotation_rollout_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "rotation_rollout_organization_id_rotation_id_fkey"
      columns: ["organization_id","rotation_id"]
isOneToOne: false
      referencedRelation: "rotation"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"rotation_slot": {
                  Row: {
                    "breaks": NonNullable<Json>,"end_time": string,"id": string,"kind": Database["public"]['Enums']["shift_kind"],"label": string | null,"line_id": string,"organization_id": string,"posting_values": NonNullable<Json>,"project_id": string | null,"rotation_id": string,"start_time": string,"supplement_type_ids": (string)[],"week_index": number,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "breaks"?: NonNullable<Json>,"end_time": string,"id"?: string,"kind"?: Database["public"]['Enums']["shift_kind"],"label"?: string | null,"line_id": string,"organization_id": string,"posting_values"?: NonNullable<Json>,"project_id"?: string | null,"rotation_id": string,"start_time": string,"supplement_type_ids"?: (string)[],"week_index": number,"weekday": number
                  }
                  Update: {
                    "breaks"?: NonNullable<Json>,"end_time"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["shift_kind"],"label"?: string | null,"line_id"?: string,"organization_id"?: string,"posting_values"?: NonNullable<Json>,"project_id"?: string | null,"rotation_id"?: string,"start_time"?: string,"supplement_type_ids"?: (string)[],"week_index"?: number,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "rotation_slot_organization_id_line_id_fkey"
      columns: ["organization_id","line_id"]
isOneToOne: false
      referencedRelation: "rotation_line"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "rotation_slot_organization_id_rotation_id_fkey"
      columns: ["organization_id","rotation_id"]
isOneToOne: false
      referencedRelation: "rotation"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "rotation_slot_project_fk"
      columns: ["organization_id","project_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"rule_violation": {
                  Row: {
                    "code": string,"created_at": string,"date": string,"department_id": string,"details": NonNullable<Json>,"employee_id": string | null,"id": string,"message": string,"organization_id": string,"overridden_by": string | null,"override_reason": string | null,"publication_id": string,"rule_id": string,"severity": string,"shift_id": string | null,"source": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"date": string,"department_id": string,"details"?: NonNullable<Json>,"employee_id"?: string | null,"id"?: string,"message": string,"organization_id": string,"overridden_by"?: string | null,"override_reason"?: string | null,"publication_id": string,"rule_id": string,"severity": string,"shift_id"?: string | null,"source"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"date"?: string,"department_id"?: string,"details"?: NonNullable<Json>,"employee_id"?: string | null,"id"?: string,"message"?: string,"organization_id"?: string,"overridden_by"?: string | null,"override_reason"?: string | null,"publication_id"?: string,"rule_id"?: string,"severity"?: string,"shift_id"?: string | null,"source"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rule_violation_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rule_violation_organization_id_publication_id_fkey"
      columns: ["organization_id","publication_id"]
isOneToOne: false
      referencedRelation: "schedule_publication"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"schedule_publication": {
                  Row: {
                    "blocking_count": number,"department_id": string,"from_date": string,"id": string,"organization_id": string,"published_at": string,"published_by": string,"shift_count": number,"to_date": string,"warning_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "blocking_count": number,"department_id": string,"from_date": string,"id"?: string,"organization_id": string,"published_at"?: string,"published_by": string,"shift_count": number,"to_date": string,"warning_count": number
                  }
                  Update: {
                    "blocking_count"?: number,"department_id"?: string,"from_date"?: string,"id"?: string,"organization_id"?: string,"published_at"?: string,"published_by"?: string,"shift_count"?: number,"to_date"?: string,"warning_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_publication_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "schedule_publication_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"shift": {
                  Row: {
                    "archived_at": string | null,"breaks": NonNullable<Json>,"created_at": string,"created_by": string | null,"department_id": string,"employee_id": string | null,"end_at": string,"id": string,"kind": Database["public"]['Enums']["shift_kind"],"label": string | null,"norm_in_pay": boolean | null,"norm_percent": number | null,"note": string | null,"organization_id": string,"posting_allocations": NonNullable<Json>,"project_allocations": NonNullable<Json>,"proposal_id": string | null,"published": Json | null,"published_at": string | null,"rollout_id": string | null,"rotation_slot_id": string | null,"start_at": string,"status": Database["public"]['Enums']["shift_status"],"supplement_type_ids": (string)[],"template_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"breaks"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"department_id": string,"employee_id"?: string | null,"end_at": string,"id"?: string,"kind"?: Database["public"]['Enums']["shift_kind"],"label"?: string | null,"norm_in_pay"?: boolean | null,"norm_percent"?: number | null,"note"?: string | null,"organization_id": string,"posting_allocations"?: NonNullable<Json>,"project_allocations"?: NonNullable<Json>,"proposal_id"?: string | null,"published"?: Json | null,"published_at"?: string | null,"rollout_id"?: string | null,"rotation_slot_id"?: string | null,"start_at": string,"status"?: Database["public"]['Enums']["shift_status"],"supplement_type_ids"?: (string)[],"template_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"breaks"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"department_id"?: string,"employee_id"?: string | null,"end_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["shift_kind"],"label"?: string | null,"norm_in_pay"?: boolean | null,"norm_percent"?: number | null,"note"?: string | null,"organization_id"?: string,"posting_allocations"?: NonNullable<Json>,"project_allocations"?: NonNullable<Json>,"proposal_id"?: string | null,"published"?: Json | null,"published_at"?: string | null,"rollout_id"?: string | null,"rotation_slot_id"?: string | null,"start_at"?: string,"status"?: Database["public"]['Enums']["shift_status"],"supplement_type_ids"?: (string)[],"template_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shift_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "shift_organization_id_employee_id_fkey"
      columns: ["organization_id","employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "shift_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shift_organization_id_template_id_fkey"
      columns: ["organization_id","template_id"]
isOneToOne: false
      referencedRelation: "shift_template"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "shift_proposal_fk"
      columns: ["organization_id","proposal_id"]
isOneToOne: false
      referencedRelation: "assistant_proposal"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "shift_rollout_fk"
      columns: ["organization_id","rollout_id"]
isOneToOne: false
      referencedRelation: "rotation_rollout"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"shift_template": {
                  Row: {
                    "archived_at": string | null,"breaks": NonNullable<Json>,"created_at": string,"department_id": string | null,"end_time": string,"id": string,"kind": Database["public"]['Enums']["shift_kind"],"label": string | null,"name": string,"norm_in_pay": boolean | null,"norm_percent": number | null,"organization_id": string,"posting_values": NonNullable<Json>,"project_id": string | null,"start_time": string,"supplement_type_ids": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"breaks"?: NonNullable<Json>,"created_at"?: string,"department_id"?: string | null,"end_time": string,"id"?: string,"kind"?: Database["public"]['Enums']["shift_kind"],"label"?: string | null,"name": string,"norm_in_pay"?: boolean | null,"norm_percent"?: number | null,"organization_id": string,"posting_values"?: NonNullable<Json>,"project_id"?: string | null,"start_time": string,"supplement_type_ids"?: (string)[]
                  }
                  Update: {
                    "archived_at"?: string | null,"breaks"?: NonNullable<Json>,"created_at"?: string,"department_id"?: string | null,"end_time"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["shift_kind"],"label"?: string | null,"name"?: string,"norm_in_pay"?: boolean | null,"norm_percent"?: number | null,"organization_id"?: string,"posting_values"?: NonNullable<Json>,"project_id"?: string | null,"start_time"?: string,"supplement_type_ids"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "shift_template_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "shift_template_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shift_template_project_fk"
      columns: ["organization_id","project_id"]
isOneToOne: false
      referencedRelation: "project"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"supplement_type": {
                  Row: {
                    "amount": number,"amount_type": Database["public"]['Enums']["supplement_amount_type"],"archived_at": string | null,"created_at": string,"employee_selectable": boolean,"id": string,"name": string,"organization_id": string,"pay_code": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"amount_type": Database["public"]['Enums']["supplement_amount_type"],"archived_at"?: string | null,"created_at"?: string,"employee_selectable"?: boolean,"id"?: string,"name": string,"organization_id": string,"pay_code": string
                  }
                  Update: {
                    "amount"?: number,"amount_type"?: Database["public"]['Enums']["supplement_amount_type"],"archived_at"?: string | null,"created_at"?: string,"employee_selectable"?: boolean,"id"?: string,"name"?: string,"organization_id"?: string,"pay_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplement_type_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"time_entry": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"archived_at": string | null,"breaks": NonNullable<Json>,"client_id": string | null,"created_at": string,"created_by": string | null,"department_id": string,"deviation_reason": string | null,"employee_id": string,"end_at": string | null,"end_client_id": string | null,"id": string,"kind": Database["public"]['Enums']["time_entry_kind"],"note": string | null,"offline": boolean,"organization_id": string,"posting_allocations": NonNullable<Json>,"project_allocations": NonNullable<Json>,"shift_id": string | null,"source": Database["public"]['Enums']["time_entry_source"],"start_at": string,"status": Database["public"]['Enums']["time_entry_status"],"superseded_at": string | null,"supersedes_id": string | null,"supplement_type_ids": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"archived_at"?: string | null,"breaks"?: NonNullable<Json>,"client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"department_id": string,"deviation_reason"?: string | null,"employee_id": string,"end_at"?: string | null,"end_client_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["time_entry_kind"],"note"?: string | null,"offline"?: boolean,"organization_id": string,"posting_allocations"?: NonNullable<Json>,"project_allocations"?: NonNullable<Json>,"shift_id"?: string | null,"source": Database["public"]['Enums']["time_entry_source"],"start_at": string,"status": Database["public"]['Enums']["time_entry_status"],"superseded_at"?: string | null,"supersedes_id"?: string | null,"supplement_type_ids"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"archived_at"?: string | null,"breaks"?: NonNullable<Json>,"client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"department_id"?: string,"deviation_reason"?: string | null,"employee_id"?: string,"end_at"?: string | null,"end_client_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["time_entry_kind"],"note"?: string | null,"offline"?: boolean,"organization_id"?: string,"posting_allocations"?: NonNullable<Json>,"project_allocations"?: NonNullable<Json>,"shift_id"?: string | null,"source"?: Database["public"]['Enums']["time_entry_source"],"start_at"?: string,"status"?: Database["public"]['Enums']["time_entry_status"],"superseded_at"?: string | null,"supersedes_id"?: string | null,"supplement_type_ids"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_entry_organization_id_department_id_fkey"
      columns: ["organization_id","department_id"]
isOneToOne: false
      referencedRelation: "department"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "time_entry_organization_id_employee_id_fkey"
      columns: ["organization_id","employee_id"]
isOneToOne: false
      referencedRelation: "employee"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "time_entry_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entry_organization_id_shift_id_fkey"
      columns: ["organization_id","shift_id"]
isOneToOne: false
      referencedRelation: "shift"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "time_entry_organization_id_supersedes_id_fkey"
      columns: ["organization_id","supersedes_id"]
isOneToOne: false
      referencedRelation: "time_entry"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"webhook_delivery": {
                  Row: {
                    "attempts": number,"created_at": string,"delivered_at": string | null,"endpoint_id": string,"event": string,"id": string,"last_error": string | null,"last_status": number | null,"next_attempt_at": string,"organization_id": string,"payload": NonNullable<Json>,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"delivered_at"?: string | null,"endpoint_id": string,"event": string,"id"?: string,"last_error"?: string | null,"last_status"?: number | null,"next_attempt_at"?: string,"organization_id": string,"payload": NonNullable<Json>,"status"?: string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"delivered_at"?: string | null,"endpoint_id"?: string,"event"?: string,"id"?: string,"last_error"?: string | null,"last_status"?: number | null,"next_attempt_at"?: string,"organization_id"?: string,"payload"?: NonNullable<Json>,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "webhook_delivery_organization_id_endpoint_id_fkey"
      columns: ["organization_id","endpoint_id"]
isOneToOne: false
      referencedRelation: "webhook_endpoint"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "webhook_delivery_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_endpoint": {
                  Row: {
                    "created_at": string,"created_by": string | null,"description": string | null,"disabled_at": string | null,"events": (string)[],"id": string,"organization_id": string,"secret": string,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string | null,"disabled_at"?: string | null,"events": (string)[],"id"?: string,"organization_id": string,"secret": string,"url": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string | null,"disabled_at"?: string | null,"events"?: (string)[],"id"?: string,"organization_id"?: string,"secret"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "webhook_endpoint_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organization"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_leave_posting":
{ Args: { "p_account": string,"p_employee_id": string,"p_hundredths": number,"p_kind": Database["public"]['Enums']["leave_posting_kind"],"p_note": string,"p_period_start": string,"p_usable_until": string }; Returns: string
                           },
"api_key_lookup":
{ Args: { "p_hash": string }; Returns: {
              "key_id": string,"organization_id": string,"scopes": (string)[]
            }[]
                           },
"api_stamp":
{ Args: { "p_action": string,"p_at": string,"p_client_id": string,"p_employee_id": string,"p_organization_id": string }; Returns: string
                           },
"approve_time_entries":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"archive_employee":
{ Args: { "p_id": string }; Returns: undefined
                           },
"archive_pay_period_group":
{ Args: { "p_id": string }; Returns: undefined
                           },
"can_impersonate":
{ Args: { "p_employee_id": string }; Returns: {
              "allowed": boolean,"email": string,"reason": string,"user_id": string
            }[]
                           },
"can_on_department":
{ Args: { "dept": string,"perm": string }; Returns: boolean
                           },
"can_on_employee":
{ Args: { "emp": string,"perm": string }; Returns: boolean
                           },
"cancel_absence":
{ Args: { "p_id": string,"p_note": string }; Returns: undefined
                           },
"celebrations":
{ Args: { "p_days"?: number,"p_from": string,"p_org": string }; Returns: {
              "department_name": string,"employee_id": string,"kind": string,"name": string,"on_date": string,"years": number
            }[]
                           },
"close_pay_period":
{ Args: { "p_id": string }; Returns: undefined
                           },
"complete_as_planned":
{ Args: { "p_shift_ids": (string)[] }; Returns: number
                           },
"correct_time_entry":
{ Args: { "p_breaks": Json,"p_end_at": string,"p_id": string,"p_posting_allocations"?: Json,"p_project_allocations": Json,"p_reason": string,"p_start_at": string,"p_supplement_type_ids"?: (string)[] }; Returns: string
                           },
"create_employee":
{ Args: { "p_birth_date": string,"p_department_id": string,"p_email"?: string,"p_employee_number": string,"p_first_name": string,"p_hired_on"?: string,"p_last_name": string,"p_phone"?: string,"p_school_obligated"?: boolean,"p_school_obligation_ends_on"?: string }; Returns: string
                           },
"decide_absence":
{ Args: { "p_approve": boolean,"p_id": string,"p_note": string,"p_usage": Json }; Returns: undefined
                           },
"decide_expense_items":
{ Args: { "p_decision": string,"p_expense_ids": (string)[],"p_note"?: string,"p_trip_ids": (string)[] }; Returns: number
                           },
"end_impersonation":
{ Args: { "p_session": string }; Returns: undefined
                           },
"impersonation_info":
{ Args: { "p_session": string }; Returns: {
              "admin_email": string,"employee_id": string,"employee_name": string
            }[]
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_permissions":
{ Args: { "org": string }; Returns: {
              "permission": string,"scope": Database["public"]['Enums']["permission_scope"]
            }[]
                           },
"organization_members":
{ Args: { "org": string }; Returns: {
              "email": string,"employee_id": string,"first_name": string,"last_name": string,"profile_id": string,"user_id": string
            }[]
                           },
"planned_work_dates":
{ Args: { "p_employee_id": string,"p_from": string,"p_to": string }; Returns: string[]
                           },
"platform_add_owner":
{ Args: { "p_org": string,"p_user": string }; Returns: undefined
                           },
"platform_create_organization":
{ Args: { "p_name": string }; Returns: string
                           },
"platform_organizations":
{ Args: Record<PropertyKey, never>; Returns: {
              "archived_at": string,"created_at": string,"employee_count": number,"id": string,"member_count": number,"name": string,"owner_emails": (string)[]
            }[]
                           },
"platform_set_archived":
{ Args: { "p_archived": boolean,"p_org": string }; Returns: undefined
                           },
"platform_user_id":
{ Args: { "p_email": string }; Returns: string
                           },
"post_leave_accruals":
{ Args: { "p_employee_id": string,"p_postings": Json }; Returns: number
                           },
"project_shifts":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "breaks": Json,"department_id": string,"department_name": string,"employee_id": string,"employee_name": string,"employee_number": string,"end_at": string,"id": string,"kind": Database["public"]['Enums']["shift_kind"],"posting_allocations": Json,"start_at": string,"status": Database["public"]['Enums']["shift_status"]
            }[]
                           },
"project_time_entries":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "breaks": Json,"department_id": string,"department_name": string,"employee_id": string,"employee_name": string,"employee_number": string,"end_at": string,"id": string,"posting_allocations": Json,"start_at": string,"status": Database["public"]['Enums']["time_entry_status"]
            }[]
                           },
"publish_agreement_version":
{ Args: { "p_id": string }; Returns: undefined
                           },
"publish_schedule":
{ Args: { "p_actor": string,"p_department_id": string,"p_from": string,"p_from_date": string,"p_to": string,"p_to_date": string,"p_violations": Json }; Returns: string
                           },
"published_shifts":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "breaks": Json,"department_id": string,"department_name": string,"employee_id": string,"employee_name": string,"end_at": string,"id": string,"is_mine": boolean,"kind": Database["public"]['Enums']["shift_kind"],"label": string,"start_at": string
            }[]
                           },
"reopen_expense_items":
{ Args: { "p_expense_ids": (string)[],"p_trip_ids": (string)[] }; Returns: number
                           },
"save_pay_run":
{ Args: { "p_daily": Json,"p_employee_id": string,"p_engine_version": string,"p_lines": Json,"p_notes": Json,"p_pending": number,"p_period_id": string }; Returns: string
                           },
"set_primary_department":
{ Args: { "p_department_id": string,"p_employee_id": string }; Returns: undefined
                           },
"set_profile_grants":
{ Args: { "p_grants": Json,"p_profile_id": string }; Returns: undefined
                           },
"set_show_celebrations":
{ Args: { "p_show": boolean }; Returns: undefined
                           },
"shifts_for_validation":
{ Args: { "p_employee_ids": (string)[],"p_from": string,"p_to": string }; Returns: {
              "breaks": Json,"department_id": string,"employee_id": string,"end_at": string,"id": string,"kind": Database["public"]['Enums']["shift_kind"],"start_at": string,"status": Database["public"]['Enums']["shift_status"]
            }[]
                           },
"stamp":
{ Args: { "p_action": string,"p_at": string,"p_client_id": string,"p_organization_id": string,"p_posting_allocations"?: Json }; Returns: string
                           },
"start_impersonation":
{ Args: { "p_employee_id": string }; Returns: string
                           },
"time_approvees":
{ Args: { "p_org": string }; Returns: string[]
                           },
"time_entry_history":
{ Args: { "p_id": string }; Returns: {
              "approved_as_email": string,"approved_at": string,"approved_by_email": string,"breaks": Json,"created_as_email": string,"created_at": string,"created_by_email": string,"deviation_reason": string,"end_at": string,"id": string,"source": Database["public"]['Enums']["time_entry_source"],"start_at": string,"status": Database["public"]['Enums']["time_entry_status"],"superseded_at": string
            }[]
                           },
"time_overview":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "approved_at": string,"approved_by_email": string,"breaks": Json,"department_id": string,"department_name": string,"deviation_reason": string,"employee_id": string,"employee_name": string,"employee_number": string,"end_at": string,"entry_id": string,"is_mine": boolean,"kind": Database["public"]['Enums']["time_entry_kind"],"note": string,"offline": boolean,"plan_breaks": Json,"plan_end": string,"plan_start": string,"posting_allocations": Json,"project_allocations": Json,"row_kind": string,"shift_id": string,"source": Database["public"]['Enums']["time_entry_source"],"start_at": string,"status": Database["public"]['Enums']["time_entry_status"],"supplement_type_ids": (string)[],"version": number
            }[]
                           },
"unapprove_time_entries":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"update_pay_period_group":
{ Args: { "p_anchor_date": string,"p_frequency": Database["public"]['Enums']["pay_frequency"],"p_id": string,"p_month_start_day": number,"p_name": string }; Returns: undefined
                           },
"webhook_claim":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,"event": string,"id": string,"payload": Json,"secret": string,"url": string
            }[]
                           },
"webhook_ping":
{ Args: { "p_endpoint_id": string }; Returns: undefined
                           },
"webhook_result":
{ Args: { "p_error": string,"p_id": string,"p_ok": boolean,"p_status": number }; Returns: undefined
                           }
          }
          Enums: {
            "absence_status": "requested"|"approved"|"rejected"|"cancelled","agreement_kind": "base"|"agreement"|"local","agreement_version_status": "draft"|"published"|"archived","availability_kind": "unavailable"|"available"|"wish_off"|"wish_work","leave_posting_kind": "accrual"|"usage"|"reversal"|"transfer"|"payout"|"adjustment","pay_form": "hourly"|"monthly","pay_frequency": "weekly"|"biweekly"|"monthly","pay_period_status": "open"|"closed","permission_scope": "departments"|"organization","shift_kind": "work"|"on_call","shift_status": "draft"|"published","supplement_amount_type": "per_hour"|"fixed"|"percent","time_entry_kind": "work"|"on_call"|"call_out","time_entry_source": "stamp"|"planned"|"manual","time_entry_status": "open"|"pending"|"approved"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "absence_status": ["requested", "approved", "rejected", "cancelled"],"agreement_kind": ["base", "agreement", "local"],"agreement_version_status": ["draft", "published", "archived"],"availability_kind": ["unavailable", "available", "wish_off", "wish_work"],"leave_posting_kind": ["accrual", "usage", "reversal", "transfer", "payout", "adjustment"],"pay_form": ["hourly", "monthly"],"pay_frequency": ["weekly", "biweekly", "monthly"],"pay_period_status": ["open", "closed"],"permission_scope": ["departments", "organization"],"shift_kind": ["work", "on_call"],"shift_status": ["draft", "published"],"supplement_amount_type": ["per_hour", "fixed", "percent"],"time_entry_kind": ["work", "on_call", "call_out"],"time_entry_source": ["stamp", "planned", "manual"],"time_entry_status": ["open", "pending", "approved"]
          }
        }
} as const
