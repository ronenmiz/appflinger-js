// Maps the id of an MP4 video to some info used to parse the MP4 in chunks
var mp4Dict = {};

// MP4 Atom header consists of the size (4 bytes) followed by the type (4 bytes)
var MP4AtomHeaderSize = 8;

function mp4MimeType(mimeType) {
	return mimeType.search(/audio\/mp4/i) >= 0
			|| mimeType.search(/video\/mp4/i) >= 0;
}

function prependHeaderToData(offset, data) {
	return abConcat(abConcat(unsigned2ab(offset),
			unsigned2ab(data.byteLength)), data);
}

function mp4GetNextAtom(buf, missingLen) {
	if (missingLen > 0) {
		var len = Math.min(missingLen, buf.byteLength);
		return {
			"atomType" : null,
			"missingLen" : missingLen - len,
			"atomLenInBuf" : len
		}
	}

	if (buf.byteLength < MP4AtomHeaderSize) {
		// TODO fix this
		console.log("Error processing MP4 atoms");
	}

	// Atom header is 8 bytes, the first 4 bytes are the atom size and the next 4 bytes are the atom type
	var atomSize = ab2unsignedBE(buf);
	var atomType = ab2str(buf.slice(4, 8));
	if (atomSize > buf.byteLength) {
		return {
			"atomType" : atomType,
			"missingLen" : atomSize - buf.byteLength,
			"atomLenInBuf" : buf.byteLength
		}
	} else {
		return {
			"atomType" : atomType,
			"missingLen" : 0,
			"atomLenInBuf" : atomSize
		}
	}
}

// Remove the contents of the mdat atom (which holds the audio/video data) and encode the rest (which is just the headers)
// as a collection of data segments preceded by an 8 byte header holding the offset (first 4 bytes) and length of segment
// (remaining 4 bytes). The original buffer can then be easily reconstructed, with the exception of content of mdat atom
// which will need to be e.g. just zeroes. This will allow someone that relies on the MP4 header to have it without
// needing to pass the entire data (given that the header is just few percentage points from the whole data, this is significant).
function mp4EncodeWithoutMDAT(resourceId, range, sequenceNumber, buf) {
	var mp4Info = {
			"atomType" : null,
			"missingLen" : 0
		};;

	if (mp4Dict[resourceId])
	{
		// If we have ranges then we use the state of the previous range
		// otherwise we use a generic state and assume that requests happen sequentially
		var key = sequenceNumber != null ? sequenceNumber - 1 : range != null ? range[0] - 1 : "mp4Info";
		var entry = mp4Dict[resourceId][key]
		if (entry)
		{
			mp4Info.atomType = entry.atomType;
			mp4Info.missingLen = entry.missingLen;
		}
	}
	else
		mp4Dict[resourceId] = {};
	
	var appendStart = mp4Info.atomType == "mdat" ? -1 : 0;
	var offset = 0;
	var result = null;

	while (offset < buf.byteLength) {
		var atomInfo = mp4GetNextAtom(buf.slice(offset),
				mp4Info.missingLen);

		// sanity check to avoid infinite loops
		if (atomInfo.atomLenInBuf == 0) {
			console.log("Internal error: ", offset, atomInfo.atomType);
			break;
		}

		if (atomInfo.atomType != null && !MP4Atoms.hasOwnProperty(atomInfo.atomType))
		{
			console.log("Internal Error: unknown MP4 atom -- ", atomInfo.atomType, ", offset:", offset, ", missingLen:", mp4Info.missingLen, resourceId);
			
			// Try to recover
			if (mp4Dict[resourceId])
				delete mp4Dict[resourceId];
			return null;
		}

		if (atomInfo.atomType != null) {
			// We exclude mdat atom (where the actual audio and video streams reside) and only
			// encode the other atoms
			if (atomInfo.atomType == "mdat") {
				// Append the data before the mdat (along with the mdat atom size/type),
				// preceeded with a header that we add, holding the offset and the size so that
				// the full buffer can be reconstructed (without the contents of the mdat atom of-course)
				if (appendStart >= 0)
					result = abConcat(result, prependHeaderToData(
							appendStart, buf.slice(appendStart, offset
									+ MP4AtomHeaderSize)));
				else
					result = abConcat(result, prependHeaderToData(
							offset, buf.slice(offset, offset
									+ MP4AtomHeaderSize)));
				appendStart = offset + atomInfo.atomLenInBuf; // skip the mdat data in the buffer
			} else if (appendStart < 0)
				appendStart = offset;

			mp4Info.atomType = atomInfo.atomType;
		}

		offset += atomInfo.atomLenInBuf;
		mp4Info.missingLen = atomInfo.missingLen;
	}

	if (appendStart >= 0 && appendStart < buf.byteLength)
		result = abConcat(result, prependHeaderToData(appendStart, buf
				.slice(appendStart)));

	// Update the dictionary
	var key = sequenceNumber != null ? sequenceNumber : range != null ? range[1] : "mp4Info";
	mp4Dict[resourceId][key] = mp4Info;

	return result == null ? new ArrayBuffer : result;
}

function mp4EncodeClearState(resourceId)
{
	if (typeof resourceId == "undefined")
		mp4Dict = {};
	else if (mp4Dict.hasOwnProperty(resourceId))
		delete mp4Dict[resourceId];
}

// Dictionary of MP4 atoms (taken from http://www.mp4ra.org/atoms.html)

var MP4Atoms = {

// ISO family codes

		"ainf" : 1,		// Asset information to identify, license and play	DECE
		"avcn" : 1,		// AVC NAL Unit Storage Box	DECE
		"bloc" : 1,		// Base location and purchase location for license acquisition	DECE
		"bpcc" : 1,		// Bits per component	JP2
		"buff" : 1,		// Buffering information	NALu Video
		"bxml" : 1,		// binary XML container	ISO
		"ccid" : 1,		// OMA DRM Content ID	OMA DRM 2.1
		"cdef" : 1,		// type and ordering of the components within the codestream	JP2
		"clip" : 1,		// Reserved	ISO
		"cmap" : 1,		// mapping between a palette and codestream components	JP2
		"co64" : 1,		// 64-bit chunk offset	ISO
		"coin" : 1,		// Content Information Box	DECE
		"colr" : 1,		// specifies the colourspace of the image	JP2
		"crgn" : 1,		// Reserved	ISO
		"crhd" : 1,		// reserved for ClockReferenceStream header	MP4V1
		"cslg" : 1,		// composition to decode timeline mapping	ISO
		"ctab" : 1,		// Reserved	ISO
		"ctts" : 1,		// (composition) time to sample	ISO
		"cvru" : 1,		// OMA DRM Cover URI	OMA DRM 2.1
		"dinf" : 1,		// data information box, container	ISO
		"dref" : 1,		// data reference box, declares source(s) of media data in track	ISO
		"dsgd" : 1,		// DVB Sample Group Description Box	DVB
		"dstg" : 1,		// DVB Sample to Group Box	DVB
		"edts" : 1,		// edit list container	ISO
		"elst" : 1,		// an edit list	ISO
		"emsg" : 1,		// event message	DASH
		"fdel" : 1,		// File delivery information (item info extension)	ISO
		"feci" : 1,		// FEC Informatiom	ISO
		"fecr" : 1,		// FEC Reservoir	ISO
		"fiin" : 1,		// FD Item Information	ISO
		"fire" : 1,		// File Reservoir	ISO
		"fpar" : 1,		// File Partition	ISO
		"free" : 1,		// free space	ISO
		"frma" : 1,		// original format box	ISO
		"ftyp" : 1,		// file type and compatibility	JP2, ISO
		"gitn" : 1,		// Group ID to name	ISO
		"grpi" : 1,		// OMA DRM Group ID	OMA DRM 2.0
		"hdlr" : 1,		// handler, declares the media (handler) type	ISO
		"hmhd" : 1,		// hint media header, overall information (hint track only)	ISO
		"hpix" : 1,		// Hipix Rich Picture (user-data or meta-data)	HIPIX
		"icnu" : 1,		// OMA DRM Icon URI	OMA DRM 2.0
		"ID32" : 1,		// ID3 version 2 container	inline
		"idat" : 1,		// Item data	ISO
		"ihdr" : 1,		// Image Header	JP2
		"iinf" : 1,		// item information	ISO
		"iloc" : 1,		// item location	ISO
		"imap" : 1,		// Reserved	ISO
		"imif" : 1,		// IPMP Information box	ISO
		"infe" : 1,		// Item information entry	ISO
		"infu" : 1,		// OMA DRM Info URL	OMA DRM 2.0
		"iods" : 1,		// Object Descriptor container box	MP4V1
		"iphd" : 1,		// reserved for IPMP Stream header	MP4V1
		"ipmc" : 1,		// IPMP Control Box	ISO
		"ipro" : 1,		// item protection	ISO
		"iref" : 1,		// Item reference	ISO
		"jP  " : 1,		// JPEG 2000 Signature	JP2
		"jp2c" : 1,		// JPEG 2000 contiguous codestream	JP2
		"jp2h" : 1,		// Header	JP2
		"jp2i" : 1,		// intellectual property information	JP2
		"kmat" : 1,		// Reserved	ISO
		"leva" : 1,		// Leval assignment	ISO
		"load" : 1,		// Reserved	ISO
		"lrcu" : 1,		// OMA DRM Lyrics URI	OMA DRM 2.1
		"m7hd" : 1,		// reserved for MPEG7Stream header	MP4V1
		"matt" : 1,		// Reserved	ISO
		"mdat" : 1,		// media data container	ISO
		"mdhd" : 1,		// media header, overall information about the media	ISO
		"mdia" : 1,		// container for the media information in a track	ISO
		"mdri" : 1,		// Mutable DRM information	OMA DRM 2.0
		"meco" : 1,		// additional metadata container	ISO
		"mehd" : 1,		// movie extends header box	ISO
		"mere" : 1,		// metabox relation	ISO
		"meta" : 1,		// Metadata container	ISO
		"mfhd" : 1,		// movie fragment header	ISO
		"mfra" : 1,		// Movie fragment random access	ISO
		"mfro" : 1,		// Movie fragment random access offset	ISO
		"minf" : 1,		// media information container	ISO
		"mjhd" : 1,		// reserved for MPEG-J Stream header	MP4V1
		"moof" : 1,		// movie fragment	ISO
		"moov" : 1,		// container for all the meta-data	ISO
		"mvcg" : 1,		// Multiview group	NALu Video
		"mvci" : 1,		// Multiview Information	NALu Video
		"mvex" : 1,		// movie extends box	ISO
		"mvhd" : 1,		// movie header, overall declarations	ISO
		"mvra" : 1,		// Multiview Relation Attribute	NALu Video
		"nmhd" : 1,		// Null media header, overall information (some tracks only)	ISO
		"ochd" : 1,		// reserved for ObjectContentInfoStream header	MP4V1
		"odaf" : 1,		// OMA DRM Access Unit Format	OMA DRM 2.0
		"odda" : 1,		// OMA DRM Content Object	OMA DRM 2.0
		"odhd" : 1,		// reserved for ObjectDescriptorStream header	MP4V1
		"odhe" : 1,		// OMA DRM Discrete Media Headers	OMA DRM 2.0
		"odrb" : 1,		// OMA DRM Rights Object	OMA DRM 2.0
		"odrm" : 1,		// OMA DRM Container	OMA DRM 2.0
		"odtt" : 1,		// OMA DRM Transaction Tracking	OMA DRM 2.0
		"ohdr" : 1,		// OMA DRM Common headers	OMA DRM 2.0
		"padb" : 1,		// sample padding bits	ISO
		"paen" : 1,		// Partition Entry	ISO
		"pclr" : 1,		// palette which maps a single component in index space to a multiple- component image	JP2
		"pdin" : 1,		// Progressive download information	ISO
		"pitm" : 1,		// primary item reference	ISO
		"pnot" : 1,		// Reserved	ISO
		"prft" : 1,		// Producer reference time	ISO
		"pssh" : 1,		// Protection system specific header	ISO-CENC
		"res " : 1,		// grid resolution	JP2
		"resc" : 1,		// grid resolution at which the image was captured	JP2
		"resd" : 1,		// default grid resolution at which the image should be displayed	JP2
		"rinf" : 1,		// restricted scheme information box	ISO
		"saio" : 1,		// Sample auxiliary information offsets	ISO
		"saiz" : 1,		// Sample auxiliary information sizes	ISO
		"sbgp" : 1,		// Sample to Group box	NALu Video, ISO
		"schi" : 1,		// scheme information box	ISO
		"schm" : 1,		// scheme type box	ISO
		"sdep" : 1,		// Sample dependency	NALu Video
		"sdhd" : 1,		// reserved for SceneDescriptionStream header	MP4V1
		"sdtp" : 1,		// Independent and Disposable Samples Box	NALu Video, ISO
		"sdvp" : 1,		// SD Profile Box	SDV
		"segr" : 1,		// file delivery session group	ISO
		"senc" : 1,		// Sample specific encryption data	ISO-CENC
		"sgpd" : 1,		// Sample group definition box	NALu Video, ISO
		"sidx" : 1,		// Segment Index Box	3GPP
		"sinf" : 1,		// protection scheme information box	ISO
		"skip" : 1,		// free space	ISO
		"smhd" : 1,		// sound media header, overall information (sound track only)	ISO
		"srmb" : 1,		// System Renewability Message	DVB
		"srmc" : 1,		// System Renewability Message container	DVB
		"srpp" : 1,		// STRP Process	ISO
		"ssix" : 1,		// Sub-sample index	ISO
		"stbl" : 1,		// sample table box, container for the time/space map	ISO
		"stco" : 1,		// chunk offset, partial data-offset information	ISO
		"stdp" : 1,		// sample degradation priority	ISO
		"sthd" : 1,		// Subtitle Media Header Box	ISO
		"strd" : 1,		// Sub-track definition	ISO
		"stri" : 1,		// Sub-track information	ISO
		"stsc" : 1,		// sample-to-chunk, partial data-offset information	ISO
		"stsd" : 1,		// sample descriptions (codec types, initialization etc.)	ISO
		"stsg" : 1,		// Sub-track sample grouping	ISO
		"stsh" : 1,		// shadow sync sample table	ISO
		"stss" : 1,		// sync sample table (random access points)	ISO
		"stsz" : 1,		// sample sizes (framing)	ISO
		"stts" : 1,		// (decoding) time-to-sample	ISO
		"styp" : 1,		// Segment Type Box	3GPP
		"stz2" : 1,		// compact sample sizes (framing)	ISO
		"subs" : 1,		// Sub-sample information	ISO
		"swtc" : 1,		// Multiview Group Relation	NALu Video
		"tfad" : 1,		// Track fragment adjustment box	3GPP
		"tfdt" : 1,		// Track fragment decode time	ISO
		"tfhd" : 1,		// Track fragment header	ISO
		"tfma" : 1,		// Track fragment media adjustment box	3GPP
		"tfra" : 1,		// Track fragment radom access	ISO
		"tibr" : 1,		// Tier Bit rate	NALu Video
		"tiri" : 1,		// Tier Information	NALu Video
		"tkhd" : 1,		// Track header, overall information about the track	ISO
		"traf" : 1,		// Track fragment	ISO
		"trak" : 1,		// container for an individual track or stream	ISO
		"tref" : 1,		// track reference container	ISO
		"trex" : 1,		// track extends defaults	ISO
		"trgr" : 1,		// Track grouping information	ISO
		"trik" : 1,		// Facilitates random access and trick play modes	DECE
		"trun" : 1,		// track fragment run	ISO
		"udta" : 1,		// user-data	ISO
		"uinf" : 1,		// a tool by which a vendor may provide access to additional information associated with a UUID	JP2
		"UITS" : 1,		// Unique Identifier Technology Solution	Universal Music
		"ulst" : 1,		// a list of UUID’s	JP2
		"url " : 1,		// a URL	JP2
		"uuid" : 1,		// user-extension box	ISO, JP2
		"vmhd" : 1,		// video media header, overall information (video track only)	ISO
		"vwdi" : 1,		// Multiview Scene Information	NALu Video
		"xml " : 1,		// XML container	ISO
		"xml " : 1,		// a tool by which vendors can add XML formatted information	JP2

// User-data Codes

		"albm" : 1,		// Album title and track number for media	3GPP
		"angl" : 1,		// Name of the camera angle through which the clip was shot	Apple
		"auth" : 1,		// Author of the media	3GPP
		"clfn" : 1,		// Name of the clip file	Apple
		"clid" : 1,		// Identifier of the clip	Apple
		"clsf" : 1,		// Classification of the media	3GPP
		"cmid" : 1,		// Identifier of the camera	Apple
		"cmnm" : 1,		// Name that identifies the camera	Apple
		"coll" : 1,		// Name of the collection from which the media comes	3GPP
		"cprt" : 1,		// copyright etc.	ISO
		"date" : 1,		// Date and time, formatted according to ISO 8601, when the content was created. For clips captured by recording devices, this is typically the date and time when the clip’s recording started.	Apple
		"dscp" : 1,		// Media description	3GPP
		"gnre" : 1,		// Media genre	3GPP
		"hinf" : 1,		// hint information	ISO
		"hnti" : 1,		// Hint information	ISO
		"hpix" : 1,		// Hipix Rich Picture (user-data or meta-data)	HIPIX
		"kywd" : 1,		// Media keywords	3GPP
		"loci" : 1,		// Media location information	3GPP
		"manu" : 1,		// Manufacturer name of the camera	Apple
		"modl" : 1,		// Model name of the camera	Apple
		"perf" : 1,		// Media performer name	3GPP
		"reel" : 1,		// Name of the tape reel	Apple
		"rtng" : 1,		// Media rating	3GPP
		"scen" : 1,		// Name of the scene for which the clip was shot	Apple
		"shot" : 1,		// Name that identifies the shot	Apple
		"slno" : 1,		// Serial number of the camera	Apple
		"strk" : 1,		// Sub track information	ISO
		"thmb" : 1,		// Thumbnail image of the media	3GPP
		"titl" : 1,		// Media title	3GPP
		"tsel" : 1,		// Track selection	ISO
		"tsel" : 1,		// Track selection	3GPP
		"urat" : 1,		// User 'star' rating of the media	3GPP
		"yrrc" : 1,		// Year when media was recorded	3GPP

// QuickTime Codes

		"albm" : 1,		// Album title and track number (user-data)	3GPP
		"auth" : 1,		// Media author name (user-data)	3GPP
		"clip" : 1,		// Visual clipping region container	QT
		"clsf" : 1,		// Media classification (user-data)	3GPP
		"cprt" : 1,		// copyright etc. (user-data)	ISO
		"crgn" : 1,		// Visual clipping region definition	QT
		"ctab" : 1,		// Track color-table	QT
		"dcfD" : 1,		// Marlin DCF Duration, user-data atom type	OMArlin
		"elng" : 1,		// Extended Language Tag	QT
		"imap" : 1,		// Track input map definition	QT
		"kmat" : 1,		// Compressed visual track matte	QT
		"load" : 1,		// Track pre-load definitions	QT
		"matt" : 1,		// Visual track matte for compositing	QT
		"pnot" : 1,		// Preview container	QT
		"wide" : 1,		// Expansion space reservation	QT
};
