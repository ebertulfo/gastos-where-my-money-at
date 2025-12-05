export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      statements: {
        Row: {
          id: string
          source_file_name: string
          source_file_sha256: string
          bank: string | null
          account_name: string | null
          account_last4: string | null
          statement_type: 'bank' | 'credit_card'
          period_start: string
          period_end: string
          timezone: string
          currency: string
          uploaded_by: string
          uploaded_at: string
          status: 'parsed' | 'ingesting' | 'ingested' | 'failed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          source_file_name: string
          source_file_sha256: string
          bank?: string | null
          account_name?: string | null
          account_last4?: string | null
          statement_type: 'bank' | 'credit_card'
          period_start: string
          period_end: string
          timezone?: string
          currency?: string
          uploaded_by: string
          uploaded_at?: string
          status?: 'parsed' | 'ingesting' | 'ingested' | 'failed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          source_file_name?: string
          source_file_sha256?: string
          bank?: string | null
          account_name?: string | null
          account_last4?: string | null
          statement_type?: 'bank' | 'credit_card'
          period_start?: string
          period_end?: string
          timezone?: string
          currency?: string
          uploaded_by?: string
          uploaded_at?: string
          status?: 'parsed' | 'ingesting' | 'ingested' | 'failed'
          created_at?: string
          updated_at?: string
        }
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          statement_id: string
          transaction_identifier: string
          date: string
          month_bucket: string
          description: string
          amount: number
          balance: number | null
          statement_page: number | null
          line_number: number | null
          status: 'active' | 'voided'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          statement_id: string
          transaction_identifier: string
          date: string
          month_bucket: string
          description: string
          amount: number
          balance?: number | null
          statement_page?: number | null
          line_number?: number | null
          status?: 'active' | 'voided'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          statement_id?: string
          transaction_identifier?: string
          date?: string
          month_bucket?: string
          description?: string
          amount?: number
          balance?: number | null
          statement_page?: number | null
          line_number?: number | null
          status?: 'active' | 'voided'
          created_at?: string
          updated_at?: string
        }
      }
      transaction_imports: {
        Row: {
          id: string
          statement_id: string
          transaction_identifier: string
          date: string
          month_bucket: string
          description: string
          amount: number
          balance: number | null
          statement_page: number | null
          line_number: number | null
          resolution: 'pending' | 'accepted' | 'rejected'
          existing_transaction_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          statement_id: string
          transaction_identifier: string
          date: string
          month_bucket: string
          description: string
          amount: number
          balance?: number | null
          statement_page?: number | null
          line_number?: number | null
          resolution?: 'pending' | 'accepted' | 'rejected'
          existing_transaction_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          statement_id?: string
          transaction_identifier?: string
          date?: string
          month_bucket?: string
          description?: string
          amount?: number
          balance?: number | null
          statement_page?: number | null
          line_number?: number | null
          resolution?: 'pending' | 'accepted' | 'rejected'
          existing_transaction_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      statement_type: 'bank' | 'credit_card'
      statement_status: 'parsed' | 'ingesting' | 'ingested' | 'failed'
      import_resolution: 'pending' | 'accepted' | 'rejected'
      transaction_status: 'active' | 'voided'
    }
  }
}

// Helper types for easier usage
export type Statement = Database['public']['Tables']['statements']['Row']
export type StatementInsert = Database['public']['Tables']['statements']['Insert']
export type StatementUpdate = Database['public']['Tables']['statements']['Update']

export type Transaction = Database['public']['Tables']['transactions']['Row']
export type TransactionInsert = Database['public']['Tables']['transactions']['Insert']
export type TransactionUpdate = Database['public']['Tables']['transactions']['Update']

export type TransactionImport = Database['public']['Tables']['transaction_imports']['Row']
export type TransactionImportInsert = Database['public']['Tables']['transaction_imports']['Insert']
export type TransactionImportUpdate = Database['public']['Tables']['transaction_imports']['Update']

export type StatementType = Database['public']['Enums']['statement_type']
export type StatementStatus = Database['public']['Enums']['statement_status']
export type ImportResolution = Database['public']['Enums']['import_resolution']
export type TransactionStatus = Database['public']['Enums']['transaction_status']
