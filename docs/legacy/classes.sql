# ************************************************************
# Sequel Pro SQL dump
# Version 4541
#
# http://www.sequelpro.com/
# https://github.com/sequelpro/sequelpro
#
# Host: 127.0.0.1 (MySQL 5.5.5-10.5.29-MariaDB)
# Database: classes
# Generation Time: 2026-06-25 17:09:11 +0000
# ************************************************************


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


# Dump of table activity_log
# ------------------------------------------------------------

DROP TABLE IF EXISTS `activity_log`;

CREATE TABLE `activity_log` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `netid` varchar(10) NOT NULL,
  `action` enum('INSERT','UPDATE','DELETE') NOT NULL,
  `table_changed` varchar(100) NOT NULL,
  `row_changed` int(11) unsigned NOT NULL,
  `field_changed` varchar(100) DEFAULT NULL,
  `new_value` text DEFAULT NULL,
  `old_value` text DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `activity_log_netid` (`netid`),
  KEY `activity_log_changed` (`table_changed`,`row_changed`),
  KEY `activity_log_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table adviserator_notes
# ------------------------------------------------------------

DROP TABLE IF EXISTS `adviserator_notes`;

CREATE TABLE `adviserator_notes` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `netid` text CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `notes` text CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `system` tinyint(1) DEFAULT 0,
  `data` text CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table all_classes_from_albert
# ------------------------------------------------------------

DROP TABLE IF EXISTS `all_classes_from_albert`;

CREATE TABLE `all_classes_from_albert` (
  `Term` varchar(255) DEFAULT NULL,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `Student Academic Group Code` varchar(255) DEFAULT NULL,
  `Student Academic Organization` varchar(255) DEFAULT NULL,
  `Student School` varchar(255) DEFAULT NULL,
  `First Name` varchar(255) DEFAULT NULL,
  `Last Name` varchar(255) DEFAULT NULL,
  `N Number` varchar(255) DEFAULT NULL,
  `NetID` varchar(255) DEFAULT NULL,
  `Course Org Reporting School` varchar(255) DEFAULT NULL,
  `Subject Code` varchar(255) DEFAULT NULL,
  `Subject` varchar(255) DEFAULT NULL,
  `Catalog Number` int(11) DEFAULT NULL,
  `Course Title` varchar(255) DEFAULT NULL,
  `Maximum Units` int(11) DEFAULT NULL,
  `Course Short Title` varchar(255) DEFAULT NULL,
  `Course Topic Title` varchar(255) DEFAULT NULL,
  `Class Section` int(11) DEFAULT NULL,
  `Instruction Mode` varchar(255) DEFAULT NULL,
  `Section Type` varchar(255) DEFAULT NULL,
  `Instructor Full Name` varchar(255) DEFAULT NULL,
  `Instructor Email` varchar(255) DEFAULT NULL,
  `Class Enrollment Status` varchar(255) DEFAULT NULL,
  `Monday Indicator` varchar(255) DEFAULT NULL,
  `Tuesday Indicator` varchar(255) DEFAULT NULL,
  `Wednesday Indicator` varchar(255) DEFAULT NULL,
  `Thursday Indicator` varchar(255) DEFAULT NULL,
  `Friday Indicator` varchar(255) DEFAULT NULL,
  `Saturday Indicator` varchar(255) DEFAULT NULL,
  `Sunday Indicator` varchar(255) DEFAULT NULL,
  `Meeting Start Time` time DEFAULT NULL,
  `Meeting End Time` time DEFAULT NULL,
  `Class Start Date` varchar(255) DEFAULT NULL,
  `Class End Date` varchar(255) DEFAULT NULL,
  `SIS Class Number` int(11) DEFAULT NULL,
  `Final Grade` varchar(255) DEFAULT NULL,
  `Instructor First Name` varchar(255) DEFAULT NULL,
  `Active Units` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table classes_from_courseleaf
# ------------------------------------------------------------

DROP TABLE IF EXISTS `classes_from_courseleaf`;

CREATE TABLE `classes_from_courseleaf` (
  `clss_id` int(10) unsigned NOT NULL,
  `class_num` int(10) unsigned DEFAULT NULL,
  `term` varchar(20) NOT NULL,
  `term_code` int(10) unsigned NOT NULL,
  `department_code` varchar(20) NOT NULL,
  `subject_code` varchar(20) NOT NULL,
  `catalog_num` int(10) unsigned NOT NULL,
  `course_num` varchar(20) NOT NULL,
  `section_num` int(10) unsigned NOT NULL,
  `title` varchar(200) NOT NULL,
  `long_title` text DEFAULT NULL,
  `component` varchar(25) DEFAULT NULL,
  `topic` varchar(200) DEFAULT NULL,
  `meeting_pattern` varchar(100) DEFAULT NULL,
  `meetings` varchar(255) DEFAULT NULL,
  `instructor` text DEFAULT NULL,
  `instructor_netid` varchar(25) DEFAULT NULL,
  `building_room` varchar(50) DEFAULT NULL,
  `status` varchar(25) NOT NULL,
  `session` varchar(100) NOT NULL,
  `start_date` varchar(20) DEFAULT NULL,
  `end_date` varchar(20) DEFAULT NULL,
  `campus` varchar(50) DEFAULT NULL,
  `instruction_method` varchar(50) DEFAULT NULL,
  `schedule_print` varchar(5) DEFAULT NULL,
  `consent` varchar(50) DEFAULT NULL,
  `credits_min` int(10) unsigned DEFAULT NULL,
  `credits` int(10) unsigned DEFAULT NULL,
  `grade_mode` varchar(30) DEFAULT NULL,
  `enrollment` int(10) unsigned DEFAULT NULL,
  `max_enrollment` int(10) unsigned DEFAULT NULL,
  `prior_enrollment` int(10) unsigned DEFAULT NULL,
  `waitlist_cap` int(11) DEFAULT NULL,
  `waitlist_total` int(11) DEFAULT NULL,
  `combinations` text DEFAULT NULL,
  `combined_enrollment` int(11) DEFAULT NULL,
  `combined_maximum` int(11) DEFAULT NULL,
  `combined_waitcap` int(11) DEFAULT NULL,
  `combined_waittotal` int(11) DEFAULT NULL,
  `notes1` text DEFAULT NULL,
  `notes2` text DEFAULT NULL,
  `notes3` text DEFAULT NULL,
  `notes4` text DEFAULT NULL,
  `notes5` text DEFAULT NULL,
  `final_exam` varchar(25) DEFAULT NULL,
  `import_timestamp` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  KEY `courseleaf_clss_id` (`clss_id`),
  KEY `courseleaf_catalog` (`subject_code`,`catalog_num`,`section_num`),
  KEY `courseleaf_status` (`title`),
  KEY `courseleaf_schedule` (`meeting_pattern`),
  KEY `courseleaf_session` (`session`),
  KEY `courseleaf_credits` (`credits`),
  KEY `courseleaf_dates` (`start_date`),
  KEY `courseleaf_enrollment` (`enrollment`),
  KEY `courseleaf_waitlist` (`waitlist_total`),
  KEY `courseleaf_instructor` (`instructor_netid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



# Dump of table course
# ------------------------------------------------------------

DROP TABLE IF EXISTS `course`;

CREATE TABLE `course` (
  `course_id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL DEFAULT '',
  `course_number` varchar(25) DEFAULT 'H79.',
  `edition` int(11) DEFAULT 1,
  `status` varchar(25) DEFAULT 'Proposed',
  `description` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `area_head` varchar(50) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `old_course_number` varchar(25) DEFAULT NULL,
  `advise_notes` text DEFAULT NULL,
  `un_area_head` varchar(50) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  KEY `course_id` (`course_id`),
  FULLTEXT KEY `title` (`title`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci COMMENT='Master course listing';



# Dump of table course_copy
# ------------------------------------------------------------

DROP TABLE IF EXISTS `course_copy`;

CREATE TABLE `course_copy` (
  `course_id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL DEFAULT '',
  `course_number` varchar(25) DEFAULT 'H79.',
  `edition` int(11) DEFAULT 1,
  `status` varchar(25) DEFAULT 'Proposed',
  `description` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `area_head` varchar(50) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `old_course_number` varchar(25) DEFAULT NULL,
  `advise_notes` text DEFAULT NULL,
  `un_area_head` varchar(50) DEFAULT NULL,
  KEY `course_id` (`course_id`),
  FULLTEXT KEY `title` (`title`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci COMMENT='Master course listing';



# Dump of table course_ima_category_bk
# ------------------------------------------------------------

DROP TABLE IF EXISTS `course_ima_category_bk`;

CREATE TABLE `course_ima_category_bk` (
  `course_code` text NOT NULL,
  `ima_cid` int(11) NOT NULL,
  `netid` varchar(11) NOT NULL DEFAULT '',
  `notes` text DEFAULT NULL,
  `semester` varchar(255) DEFAULT NULL,
  KEY `FK_course_imaca` (`ima_cid`),
  CONSTRAINT `course_ima_category_bk_ibfk_1` FOREIGN KEY (`ima_cid`) REFERENCES `ima_category` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table course_image
# ------------------------------------------------------------

DROP TABLE IF EXISTS `course_image`;

CREATE TABLE `course_image` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `course_id` int(11) NOT NULL,
  `project_id` int(11) DEFAULT NULL,
  `project_document_id` int(11) DEFAULT NULL,
  `credit` varchar(255) DEFAULT NULL COMMENT 'This field is only needed if project_id is null.',
  `original_filename` varchar(255) DEFAULT NULL COMMENT 'Really just used for the unique constraint.  Optional if project_id is set.',
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  `alt_text` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_course_image_filename` (`course_id`,`original_filename`),
  UNIQUE KEY `unique_course_image_document_id` (`course_id`,`project_document_id`),
  KEY `course_id` (`course_id`,`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='This is an *append-only* table.  When we get a new image for a course, INSERT a new row.  That way we can keep track of the previously uploaded images, and present them as an option in the future.';



# Dump of table course_x_areas
# ------------------------------------------------------------

DROP TABLE IF EXISTS `course_x_areas`;

CREATE TABLE `course_x_areas` (
  `course_id` int(11) NOT NULL DEFAULT 0,
  `area` text NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table course_x_attributes
# ------------------------------------------------------------

DROP TABLE IF EXISTS `course_x_attributes`;

CREATE TABLE `course_x_attributes` (
  `course_id` int(11) unsigned NOT NULL DEFAULT 0,
  `attribute` varchar(50) NOT NULL DEFAULT '',
  `origin` varchar(50) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `course_num` varchar(50) DEFAULT NULL,
  `year` int(11) DEFAULT NULL,
  `semester` varchar(255) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table courses_albert
# ------------------------------------------------------------

DROP TABLE IF EXISTS `courses_albert`;

CREATE TABLE `courses_albert` (
  `year` int(11) NOT NULL,
  `semester` varchar(10) NOT NULL,
  `catalog_num` varchar(20) NOT NULL,
  `section_num` int(11) NOT NULL,
  `title` varchar(100) NOT NULL,
  `sis_num` varchar(10) NOT NULL,
  `status` varchar(10) NOT NULL,
  `days` varchar(10) DEFAULT NULL,
  `time` varchar(50) DEFAULT NULL,
  `session` varchar(10) NOT NULL,
  `dates` varchar(50) DEFAULT NULL,
  `component` varchar(10) DEFAULT NULL,
  `units` varchar(10) DEFAULT NULL,
  `consent` varchar(10) DEFAULT NULL,
  `nyu_course_id` int(11) NOT NULL,
  `campus_code` varchar(10) DEFAULT NULL,
  `instruction_mode` varchar(50) DEFAULT NULL,
  `campus` varchar(50) DEFAULT NULL,
  `building_room` varchar(50) NOT NULL,
  `room_cap` int(11) DEFAULT NULL,
  `enrollment_cap` int(11) NOT NULL,
  `enrollment_total` int(11) NOT NULL,
  `waitlist_cap` int(11) DEFAULT NULL,
  `waitlist_total` int(11) DEFAULT NULL,
  `enrollment_status` varchar(20) NOT NULL,
  `combined_status` varchar(10) DEFAULT NULL,
  `combined_enrollment_cap` int(11) DEFAULT NULL,
  `combined_enrollment_total` int(11) DEFAULT NULL,
  `combined_waitlist_cap` int(11) DEFAULT NULL,
  `combined_waitlist_total` int(11) DEFAULT NULL,
  `available_seats` int(11) DEFAULT NULL,
  `subtitle` varchar(100) DEFAULT NULL,
  `instructor` varchar(100) NOT NULL,
  `instructor_netid` varchar(25) DEFAULT NULL,
  KEY `courses_albert_catalog` (`catalog_num`,`section_num`),
  KEY `courses_albert_sis` (`sis_num`),
  KEY `courses_albert_status` (`status`),
  KEY `courses_albert_schedule` (`days`,`time`),
  KEY `courses_albert_session` (`session`),
  KEY `courses_albert_units` (`units`),
  KEY `courses_albert_enrollment` (`enrollment_total`),
  KEY `courses_albert_waitlist` (`waitlist_total`),
  KEY `courses_albert_instructor` (`instructor_netid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



# Dump of table credits_ima_category
# ------------------------------------------------------------

DROP TABLE IF EXISTS `credits_ima_category`;

CREATE TABLE `credits_ima_category` (
  `id` int(11) NOT NULL,
  `source` int(11) NOT NULL,
  `ima_cid` int(11) NOT NULL,
  `notes` text DEFAULT NULL,
  `netid` varchar(10) NOT NULL DEFAULT '',
  UNIQUE KEY `unique_index` (`netid`,`id`),
  KEY `FK_course_imaca` (`ima_cid`),
  CONSTRAINT `FK_course_imaca` FOREIGN KEY (`ima_cid`) REFERENCES `ima_category` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table evals_all_responses_from_udw
# ------------------------------------------------------------

DROP TABLE IF EXISTS `evals_all_responses_from_udw`;

CREATE TABLE `evals_all_responses_from_udw` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `semester` varchar(25) DEFAULT NULL,
  `year` int(11) DEFAULT NULL,
  `net_id` varchar(11) DEFAULT NULL,
  `section_id` int(11) DEFAULT NULL,
  `Instructor_Name` varchar(50) DEFAULT NULL,
  `Instructor_N_Number` varchar(20) DEFAULT NULL,
  `Instructor` varchar(50) DEFAULT NULL,
  `Sponsor_Class_Title` varchar(255) DEFAULT NULL,
  `Sponsor_NYU_Class` varchar(20) DEFAULT NULL,
  `Responder_ID` int(20) DEFAULT NULL,
  `Question_ID_Sort` int(11) DEFAULT NULL,
  `Question_Type` varchar(50) DEFAULT NULL,
  `Question` text DEFAULT NULL,
  `Question_ID` varchar(20) DEFAULT '',
  `Response_ID` int(20) DEFAULT NULL,
  `Response` text DEFAULT NULL,
  `Location` varchar(50) DEFAULT '',
  `Term` varchar(50) DEFAULT NULL,
  `Response_1` text DEFAULT NULL,
  `Response_2` text DEFAULT NULL,
  `Response_3` text DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table evals_stats_and_comments_from_udw
# ------------------------------------------------------------

DROP TABLE IF EXISTS `evals_stats_and_comments_from_udw`;

CREATE TABLE `evals_stats_and_comments_from_udw` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `semester` varchar(25) DEFAULT NULL,
  `year` int(11) DEFAULT NULL,
  `net_id` varchar(11) DEFAULT NULL,
  `section_id` int(11) DEFAULT NULL,
  `Instructor_Name` varchar(50) DEFAULT NULL,
  `Instructor_N_Number` varchar(20) DEFAULT NULL,
  `Instructor` varchar(50) DEFAULT NULL,
  `Sponsor_Class_Title` varchar(255) DEFAULT NULL,
  `Sponsor_NYU_Class` varchar(20) DEFAULT NULL,
  `Question_Type_Sort` varchar(11) DEFAULT NULL,
  `Question_Type` varchar(50) DEFAULT NULL,
  `Question` text DEFAULT NULL,
  `Question_ID` varchar(20) DEFAULT '',
  `Location` varchar(50) DEFAULT '',
  `Median_Response` float DEFAULT NULL,
  `Number_of_Responses` int(11) DEFAULT NULL,
  `Average_Response` float DEFAULT NULL,
  `Enrollment_Total` int(11) DEFAULT NULL,
  `Standard_Deviation` float DEFAULT NULL,
  `Response_Rate` float DEFAULT NULL,
  `Mode_Response` float DEFAULT NULL,
  `Term` varchar(25) DEFAULT NULL,
  `Sponsor_Class_Number` varchar(25) DEFAULT NULL,
  `sis_class_number` int(25) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table exchange_interest_shown
# ------------------------------------------------------------

DROP TABLE IF EXISTS `exchange_interest_shown`;

CREATE TABLE `exchange_interest_shown` (
  `interest_id` int(11) NOT NULL AUTO_INCREMENT,
  `netid` varchar(10) NOT NULL,
  `major` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `submission_date` date DEFAULT NULL,
  `semester` varchar(10) DEFAULT NULL,
  `year` int(11) DEFAULT NULL,
  `department` varchar(50) DEFAULT NULL,
  `credits_so_far` int(11) DEFAULT NULL,
  `course` varchar(30) DEFAULT NULL,
  `section` int(11) DEFAULT NULL,
  `location` varchar(30) DEFAULT NULL,
  `priority` int(11) DEFAULT NULL,
  PRIMARY KEY (`interest_id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table exchange_interest_shown1
# ------------------------------------------------------------

DROP TABLE IF EXISTS `exchange_interest_shown1`;

CREATE TABLE `exchange_interest_shown1` (
  `interest_id` int(11) NOT NULL AUTO_INCREMENT,
  `netid` varchar(10) NOT NULL,
  `major` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `submission_date` date DEFAULT NULL,
  `semester` varchar(10) DEFAULT NULL,
  `year` int(11) DEFAULT NULL,
  `department` varchar(50) DEFAULT NULL,
  `credits_so_far` int(11) DEFAULT NULL,
  `course` varchar(30) DEFAULT NULL,
  `section` int(11) DEFAULT NULL,
  `location` varchar(30) DEFAULT NULL,
  `priority` int(11) DEFAULT NULL,
  PRIMARY KEY (`interest_id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table faculty_review
# ------------------------------------------------------------

DROP TABLE IF EXISTS `faculty_review`;

CREATE TABLE `faculty_review` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `faculty_member` varchar(100) NOT NULL,
  `reviewer_name` varchar(255) NOT NULL,
  `reviewer_email` varchar(255) DEFAULT NULL,
  `comment` longtext NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  FULLTEXT KEY `comment` (`comment`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table feedback
# ------------------------------------------------------------

DROP TABLE IF EXISTS `feedback`;

CREATE TABLE `feedback` (
  `id` int(6) unsigned NOT NULL AUTO_INCREMENT,
  `section_id` int(6) NOT NULL,
  `from_netid` varchar(10) NOT NULL,
  `to_netid` varchar(10) NOT NULL,
  `type_of_feedback` varchar(255) NOT NULL,
  `feedback` text NOT NULL,
  `time_stamp` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table group_members
# ------------------------------------------------------------

DROP TABLE IF EXISTS `group_members`;

CREATE TABLE `group_members` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `group_id` int(11) NOT NULL,
  `member_netid` varchar(11) NOT NULL DEFAULT '',
  `member_name` varchar(255) DEFAULT NULL,
  `member_level` int(11) DEFAULT NULL,
  `grouping_id` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table group_things
# ------------------------------------------------------------

DROP TABLE IF EXISTS `group_things`;

CREATE TABLE `group_things` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `member_id` int(11) DEFAULT NULL,
  `netid` int(11) DEFAULT NULL,
  `time` timestamp NULL DEFAULT NULL,
  `group_id` int(11) DEFAULT NULL,
  `grouping_id` int(11) DEFAULT NULL,
  `type` varchar(11) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `location` blob DEFAULT NULL,
  `content` blob DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table groupings
# ------------------------------------------------------------

DROP TABLE IF EXISTS `groupings`;

CREATE TABLE `groupings` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `grouping_name` varchar(255) NOT NULL DEFAULT '',
  `grouping_type` varchar(255) DEFAULT NULL,
  `grouping_maker_netid` varchar(25) NOT NULL DEFAULT '',
  `grouping_start_date` date DEFAULT NULL,
  `public` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table groups
# ------------------------------------------------------------

DROP TABLE IF EXISTS `groups`;

CREATE TABLE `groups` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `group_name` varchar(255) DEFAULT NULL,
  `grouping_id` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table ima_category
# ------------------------------------------------------------

DROP TABLE IF EXISTS `ima_category`;

CREATE TABLE `ima_category` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL DEFAULT '',
  `credits` int(11) DEFAULT NULL,
  `group` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table lineup_official
# ------------------------------------------------------------

DROP TABLE IF EXISTS `lineup_official`;

CREATE TABLE `lineup_official` (
  `course_id` int(11) NOT NULL,
  `section_id` int(11) unsigned NOT NULL,
  `title` varchar(255) NOT NULL,
  `course_number` varchar(25) NOT NULL,
  `section_number` varchar(25) NOT NULL,
  `call_number` varchar(25) DEFAULT NULL,
  `sis_class_number` int(11) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `course_url` varchar(255) DEFAULT NULL,
  `section_url` varchar(255) DEFAULT NULL,
  `semester` varchar(8) NOT NULL,
  `year` year(4) NOT NULL,
  `instructor_netids` varchar(100) DEFAULT NULL,
  `credits` int(11) NOT NULL,
  `meetings` varchar(100) NOT NULL,
  `mode` varchar(255) DEFAULT NULL,
  `program` varchar(25) DEFAULT NULL,
  `enrollment_limit` int(11) NOT NULL,
  `actual_enrollment` int(11) DEFAULT NULL,
  UNIQUE KEY `fk_section_id` (`section_id`),
  KEY `fk_course_id` (`course_id`),
  KEY `lineup_official_term` (`year`,`semester`),
  FULLTEXT KEY `title` (`title`),
  CONSTRAINT `fk_course_id` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`),
  CONSTRAINT `fk_section_id` FOREIGN KEY (`section_id`) REFERENCES `section` (`section_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table LoveStories
# ------------------------------------------------------------

DROP TABLE IF EXISTS `LoveStories`;

CREATE TABLE `LoveStories` (
  `who` varchar(25) NOT NULL DEFAULT '',
  `url` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table nyucalendar
# ------------------------------------------------------------

DROP TABLE IF EXISTS `nyucalendar`;

CREATE TABLE `nyucalendar` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `reason` text DEFAULT NULL,
  `semester` varchar(11) DEFAULT NULL,
  `specialdate` date DEFAULT NULL,
  `marked` int(11) DEFAULT 0,
  `note` text DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table outside_classes_from_albert
# ------------------------------------------------------------

DROP TABLE IF EXISTS `outside_classes_from_albert`;

CREATE TABLE `outside_classes_from_albert` (
  `Term` varchar(255) DEFAULT NULL,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `Student Academic Group Code` varchar(255) DEFAULT NULL,
  `Student Academic Organization` varchar(255) DEFAULT NULL,
  `Student School` varchar(255) DEFAULT NULL,
  `First Name` varchar(255) DEFAULT NULL,
  `Last Name` varchar(255) DEFAULT NULL,
  `N Number` varchar(255) DEFAULT NULL,
  `NetID` varchar(255) DEFAULT NULL,
  `Course Org Reporting School` varchar(255) DEFAULT NULL,
  `Subject Code` varchar(255) DEFAULT NULL,
  `Subject` varchar(255) DEFAULT NULL,
  `Catalog Number` int(11) DEFAULT NULL,
  `Course Title` varchar(255) DEFAULT NULL,
  `Maximum Units` int(11) DEFAULT NULL,
  `Course Short Title` varchar(255) DEFAULT NULL,
  `Course Topic Title` varchar(255) DEFAULT NULL,
  `Class Section` int(11) DEFAULT NULL,
  `Instruction Mode` varchar(255) DEFAULT NULL,
  `Section Type` varchar(255) DEFAULT NULL,
  `Instructor Full Name` varchar(255) DEFAULT NULL,
  `Instructor Email` varchar(255) DEFAULT NULL,
  `Class Enrollment Status` varchar(255) DEFAULT NULL,
  `Monday Indicator` varchar(255) DEFAULT NULL,
  `Tuesday Indicator` varchar(255) DEFAULT NULL,
  `Wednesday Indicator` varchar(255) DEFAULT NULL,
  `Thursday Indicator` varchar(255) DEFAULT NULL,
  `Friday Indicator` varchar(255) DEFAULT NULL,
  `Saturday Indicator` varchar(255) DEFAULT NULL,
  `Sunday Indicator` varchar(255) DEFAULT NULL,
  `Meeting Start Time` time DEFAULT NULL,
  `Meeting End Time` time DEFAULT NULL,
  `Class Start Date` varchar(255) DEFAULT NULL,
  `Class End Date` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table outside_classes_from_albert_bk
# ------------------------------------------------------------

DROP TABLE IF EXISTS `outside_classes_from_albert_bk`;

CREATE TABLE `outside_classes_from_albert_bk` (
  `Term` varchar(255) DEFAULT NULL,
  `Student Academic Group Code` varchar(255) DEFAULT NULL,
  `Student Academic Organization` varchar(255) DEFAULT NULL,
  `Student School` varchar(255) DEFAULT NULL,
  `First Name` varchar(255) DEFAULT NULL,
  `Last Name` varchar(255) DEFAULT NULL,
  `N Number` varchar(255) DEFAULT NULL,
  `NetID` varchar(255) DEFAULT NULL,
  `Course Org Reporting School` varchar(255) DEFAULT NULL,
  `Subject Code` varchar(255) DEFAULT NULL,
  `Subject` varchar(255) DEFAULT NULL,
  `Catalog Number` int(11) DEFAULT NULL,
  `Course Title` varchar(255) DEFAULT NULL,
  `Maximum Units` int(11) DEFAULT NULL,
  `Course Short Title` varchar(255) DEFAULT NULL,
  `Course Topic Title` varchar(255) DEFAULT NULL,
  `Class Section` int(11) DEFAULT NULL,
  `Instruction Mode` varchar(255) DEFAULT NULL,
  `Section Type` varchar(255) DEFAULT NULL,
  `Instructor Full Name` varchar(255) DEFAULT NULL,
  `Instructor Email` varchar(255) DEFAULT NULL,
  `Class Enrollment Status` varchar(255) DEFAULT NULL,
  `Monday Indicator` varchar(255) DEFAULT NULL,
  `Tuesday Indicator` varchar(255) DEFAULT NULL,
  `Wednesday Indicator` varchar(255) DEFAULT NULL,
  `Thursday Indicator` varchar(255) DEFAULT NULL,
  `Friday Indicator` varchar(255) DEFAULT NULL,
  `Saturday Indicator` varchar(255) DEFAULT NULL,
  `Sunday Indicator` varchar(255) DEFAULT NULL,
  `Meeting Start Time` time DEFAULT NULL,
  `Meeting End Time` time DEFAULT NULL,
  `Class Start Date` varchar(255) DEFAULT NULL,
  `Class End Date` varchar(255) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table ratings
# ------------------------------------------------------------

DROP TABLE IF EXISTS `ratings`;

CREATE TABLE `ratings` (
  `rating_id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int(11) DEFAULT NULL,
  `rating` int(11) DEFAULT NULL,
  `about_netid` varchar(255) DEFAULT NULL,
  `by_netid` varchar(255) DEFAULT NULL,
  `context` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `eval_json` text DEFAULT NULL,
  PRIMARY KEY (`rating_id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table reader_assignments
# ------------------------------------------------------------

DROP TABLE IF EXISTS `reader_assignments`;

CREATE TABLE `reader_assignments` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `reader` varchar(255) DEFAULT NULL,
  `link` varchar(255) DEFAULT NULL,
  `section_id` int(11) DEFAULT NULL,
  `assignment` varchar(255) DEFAULT NULL,
  `student_net_id` varchar(11) DEFAULT NULL,
  `admins` varchar(255) DEFAULT NULL,
  `thumbs` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table registration_actual
# ------------------------------------------------------------

DROP TABLE IF EXISTS `registration_actual`;

CREATE TABLE `registration_actual` (
  `section_id` int(11) NOT NULL DEFAULT 0,
  `net_id` varchar(10) NOT NULL DEFAULT '',
  `priority` int(11) NOT NULL DEFAULT 0,
  `semester` varchar(10) NOT NULL DEFAULT '',
  `year` year(4) NOT NULL DEFAULT 2005,
  `credits` decimal(4,2) DEFAULT 0.00,
  `status` varchar(10) NOT NULL DEFAULT '',
  `wait_order` int(11) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `school` varchar(255) DEFAULT NULL,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table registration_actual_bk
# ------------------------------------------------------------

DROP TABLE IF EXISTS `registration_actual_bk`;

CREATE TABLE `registration_actual_bk` (
  `section_id` int(11) NOT NULL DEFAULT 0,
  `net_id` varchar(10) NOT NULL DEFAULT '',
  `priority` int(11) NOT NULL DEFAULT 0,
  `semester` varchar(10) NOT NULL DEFAULT '',
  `year` year(4) NOT NULL DEFAULT 2005,
  `credits` int(11) DEFAULT 0,
  `status` varchar(10) NOT NULL DEFAULT '',
  `wait_order` int(11) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `school` varchar(255) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table registration_actual_ima_ca
# ------------------------------------------------------------

DROP TABLE IF EXISTS `registration_actual_ima_ca`;

CREATE TABLE `registration_actual_ima_ca` (
  `section_id` int(11) NOT NULL,
  `ima_cat_id` int(11) NOT NULL,
  KEY `FK_regact_imaca` (`ima_cat_id`),
  CONSTRAINT `FK_regact_imaca` FOREIGN KEY (`ima_cat_id`) REFERENCES `ima_category` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table registration_advised
# ------------------------------------------------------------

DROP TABLE IF EXISTS `registration_advised`;

CREATE TABLE `registration_advised` (
  `section_id` int(11) NOT NULL DEFAULT 0,
  `net_id` varchar(10) NOT NULL DEFAULT '',
  `priority` int(11) NOT NULL DEFAULT 0,
  `semester` varchar(10) NOT NULL DEFAULT '',
  `year` year(4) NOT NULL DEFAULT 2005,
  `call_number` varchar(25) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table registration_people
# ------------------------------------------------------------

DROP TABLE IF EXISTS `registration_people`;

CREATE TABLE `registration_people` (
  `registrant_id` int(11) NOT NULL AUTO_INCREMENT,
  `net_id` varchar(10) NOT NULL DEFAULT '',
  `semester` varchar(12) NOT NULL DEFAULT '0',
  `year` year(4) NOT NULL DEFAULT 0000,
  `credits_requested` int(11) NOT NULL DEFAULT 0,
  `credits_so_far` decimal(4,2) DEFAULT 0.00,
  `credits_so_far_itp` decimal(10,0) DEFAULT 0,
  `class` int(11) DEFAULT 0,
  `karma` decimal(10,0) DEFAULT 0,
  `luck` int(11) DEFAULT 0,
  `advised` varchar(15) DEFAULT '0',
  `approved` varchar(15) DEFAULT '0',
  `credits_actual` decimal(5,2) DEFAULT 0.00,
  `scheduled` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `cleared` varchar(15) DEFAULT NULL,
  `in_lottery` tinyint(1) NOT NULL DEFAULT 1,
  `semester_advisor` varchar(15) DEFAULT NULL,
  PRIMARY KEY (`registrant_id`),
  KEY `class` (`class`),
  KEY `karma` (`karma`),
  KEY `net_id` (`net_id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table registration_selections
# ------------------------------------------------------------

DROP TABLE IF EXISTS `registration_selections`;

CREATE TABLE `registration_selections` (
  `selection_id` int(11) NOT NULL AUTO_INCREMENT,
  `net_id` varchar(10) NOT NULL DEFAULT '',
  `section_id` int(11) NOT NULL DEFAULT 0,
  `status` varchar(25) NOT NULL DEFAULT '',
  `semester` varchar(8) NOT NULL DEFAULT '',
  `year` year(4) NOT NULL DEFAULT 0000,
  `from_system` varchar(25) DEFAULT 'ITP',
  `id` varchar(25) DEFAULT NULL,
  `course_number` varchar(25) DEFAULT NULL,
  `wait_pos` int(11) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`selection_id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table registration_wishes
# ------------------------------------------------------------

DROP TABLE IF EXISTS `registration_wishes`;

CREATE TABLE `registration_wishes` (
  `section_id` int(11) NOT NULL DEFAULT 0,
  `net_id` varchar(10) NOT NULL DEFAULT '',
  `priority` int(11) NOT NULL DEFAULT 0,
  `semester` varchar(10) NOT NULL DEFAULT '',
  `year` year(4) NOT NULL DEFAULT 2005,
  `call_number` varchar(25) DEFAULT NULL,
  `chances_shown` varchar(255) DEFAULT NULL,
  `chances_shown_num` int(11) DEFAULT NULL,
  `ts` timestamp NULL DEFAULT current_timestamp(),
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  KEY `net_id` (`net_id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table section
# ------------------------------------------------------------

DROP TABLE IF EXISTS `section`;

CREATE TABLE `section` (
  `section_id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `course_id` int(11) NOT NULL DEFAULT 0,
  `section_number` varchar(25) DEFAULT '1',
  `semester` varchar(8) DEFAULT NULL,
  `year` year(4) DEFAULT 2005,
  `credits` int(11) DEFAULT 4,
  `enrollment_limit` int(11) DEFAULT 18,
  `actual_enrollment` int(11) DEFAULT 0,
  `prof_evaluation_average` float DEFAULT 0,
  `course_evaluation_average` float DEFAULT 0,
  `evaluation_count` int(11) DEFAULT 0,
  `evaluation_range` float(10,0) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `call_number` varchar(25) DEFAULT NULL,
  `status` varchar(255) DEFAULT 'not set',
  `eval_by_instructor` text DEFAULT NULL,
  `meetings` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `filter` text DEFAULT NULL,
  `expose_evals` int(11) DEFAULT NULL,
  `sis_class_number` int(11) DEFAULT NULL,
  `mode` varchar(255) DEFAULT NULL,
  `program` varchar(25) DEFAULT NULL,
  `location` varchar(25) DEFAULT NULL,
  `mode_note` text DEFAULT NULL,
  `faculty_deal` varchar(255) DEFAULT NULL,
  `forum_link` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`section_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table section_backup20180712
# ------------------------------------------------------------

DROP TABLE IF EXISTS `section_backup20180712`;

CREATE TABLE `section_backup20180712` (
  `section_id` int(11) NOT NULL AUTO_INCREMENT,
  `course_id` int(11) NOT NULL DEFAULT 0,
  `section_number` varchar(25) DEFAULT '1',
  `semester` varchar(8) DEFAULT NULL,
  `year` year(4) DEFAULT 2005,
  `credits` int(11) DEFAULT 4,
  `enrollment_limit` int(11) DEFAULT 18,
  `actual_enrollment` int(11) DEFAULT 0,
  `prof_evaluation_average` float DEFAULT 0,
  `course_evaluation_average` float DEFAULT 0,
  `evaluation_count` int(11) DEFAULT 0,
  `evaluation_range` float(10,0) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `call_number` varchar(25) DEFAULT NULL,
  `status` varchar(25) DEFAULT 'not set',
  `eval_by_instructor` text DEFAULT NULL,
  `meetings` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `filter` text DEFAULT NULL,
  KEY `section_id` (`section_id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table section_SAVE
# ------------------------------------------------------------

DROP TABLE IF EXISTS `section_SAVE`;

CREATE TABLE `section_SAVE` (
  `section_id` int(11) NOT NULL AUTO_INCREMENT,
  `course_id` int(11) NOT NULL DEFAULT 0,
  `section_number` varchar(25) DEFAULT '1',
  `semester` varchar(8) DEFAULT NULL,
  `year` year(4) DEFAULT 2005,
  `credits` int(11) DEFAULT 4,
  `enrollment_limit` int(11) DEFAULT 18,
  `actual_enrollment` int(11) DEFAULT 0,
  `prof_evaluation_average` float DEFAULT 0,
  `course_evaluation_average` float DEFAULT 0,
  `evaluation_count` int(11) DEFAULT 0,
  `evaluation_average` float(10,0) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `call_number` varchar(25) DEFAULT NULL,
  `status` varchar(25) DEFAULT 'not set',
  `eval_by_instructor` text DEFAULT NULL,
  `meetings` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  KEY `section_id` (`section_id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table section_student_attendance
# ------------------------------------------------------------

DROP TABLE IF EXISTS `section_student_attendance`;

CREATE TABLE `section_student_attendance` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `section_id` int(11) NOT NULL DEFAULT 0,
  `netid` varchar(25) NOT NULL DEFAULT '',
  `class_num` int(2) NOT NULL DEFAULT 0,
  `attendance` char(1) NOT NULL DEFAULT '',
  `comment` text NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci COMMENT='holds information on student class attendance and instructor';



# Dump of table section_student_attendance_test
# ------------------------------------------------------------

DROP TABLE IF EXISTS `section_student_attendance_test`;

CREATE TABLE `section_student_attendance_test` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `section_id` int(11) NOT NULL DEFAULT 0,
  `netid` varchar(25) NOT NULL DEFAULT '',
  `class_num` int(2) NOT NULL DEFAULT 0,
  `attendance` char(1) NOT NULL DEFAULT '',
  `comment` text NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci COMMENT='holds information on student class attendance and instructor';



# Dump of table section_x_instructor
# ------------------------------------------------------------

DROP TABLE IF EXISTS `section_x_instructor`;

CREATE TABLE `section_x_instructor` (
  `section_id` int(11) NOT NULL DEFAULT 0,
  `net_id` varchar(25) NOT NULL DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table section_x_time_space
# ------------------------------------------------------------

DROP TABLE IF EXISTS `section_x_time_space`;

CREATE TABLE `section_x_time_space` (
  `time_space_id` int(11) NOT NULL AUTO_INCREMENT,
  `section_id` int(11) NOT NULL DEFAULT 0,
  `date` varchar(150) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `day` int(11) DEFAULT NULL,
  `place` varchar(150) DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `special` int(11) DEFAULT NULL,
  `date_date` date DEFAULT NULL,
  `pattern` varchar(11) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  PRIMARY KEY (`time_space_id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table stories
# ------------------------------------------------------------

DROP TABLE IF EXISTS `stories`;

CREATE TABLE `stories` (
  `who` varchar(25) NOT NULL DEFAULT '',
  `what` text NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table syllabi_json
# ------------------------------------------------------------

DROP TABLE IF EXISTS `syllabi_json`;

CREATE TABLE `syllabi_json` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `json` text NOT NULL,
  `site_url` varchar(255) DEFAULT NULL,
  `course_org_number_semester_year_section` varchar(255) DEFAULT NULL,
  `section_id` int(11) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table thesis_classes
# ------------------------------------------------------------

DROP TABLE IF EXISTS `thesis_classes`;

CREATE TABLE `thesis_classes` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `section_id` int(10) NOT NULL,
  `starttime` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci COMMENT='This table hold thesis presentation time for thesis week ';



# Dump of table thesis_students
# ------------------------------------------------------------

DROP TABLE IF EXISTS `thesis_students`;

CREATE TABLE `thesis_students` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `itp_id` int(11) NOT NULL,
  `section_id` int(10) NOT NULL,
  `time` timestamp NOT NULL DEFAULT current_timestamp(),
  `position` int(2) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table udw_evaluation_TRASHME
# ------------------------------------------------------------

DROP TABLE IF EXISTS `udw_evaluation_TRASHME`;

CREATE TABLE `udw_evaluation_TRASHME` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `instructor_type` text CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `class_title` text CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `call_num` text CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `location` text CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `question` text CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `question_id` text CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `question_type` text CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `term` text CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `total_responses` int(11) DEFAULT NULL,
  `average_resp` int(11) DEFAULT NULL,
  `total_enrollment` int(11) DEFAULT NULL,
  `strongly_disagree` int(11) DEFAULT NULL,
  `disagree` int(11) DEFAULT NULL,
  `adequate` int(11) DEFAULT NULL,
  `agree` int(11) DEFAULT NULL,
  `strongly_agree` int(11) DEFAULT NULL,
  `comments` longtext CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `instructor_n_num` text CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `question_type_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table UDWQueries
# ------------------------------------------------------------

DROP TABLE IF EXISTS `UDWQueries`;

CREATE TABLE `UDWQueries` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `queryXML` text DEFAULT NULL,
  `page` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;




/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
