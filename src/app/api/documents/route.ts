import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { id: documentId } = await params

    // Delete the document
    const { error } = await supabase
      .from('documents_enhanced')
      .delete()
      .eq('id', documentId)

    if (error) {
      console.error('Error deleting document:', error)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Document deleted successfully' })

  } catch (error) {
    console.error('Error in delete document API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { id: documentId } = await params

    const { data: document, error } = await supabase
      .from('documents_enhanced')
      .select('*')
      .eq('id', documentId)
      .single()

    if (error) {
      console.error('Error fetching document:', error)
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json({ document })

  } catch (error) {
    console.error('Error in get document API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 